import { db } from './db';

const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
const FILE_NAME = 'library_db.json';

let tokenClient: any;
let accessToken: string | null = null;

export let isBackendConfigured = false;

export async function initDriveSync() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      isBackendConfigured = data.driveConfigured;
    }
  } catch (err) {
    console.error('Failed to check backend health', err);
  }

  // Check if we have a saved token
  const savedTokenStr = db.getSetting('google_oauth_tokens');
  if (savedTokenStr) {
    try {
      const savedToken = JSON.parse(savedTokenStr);
      if (savedToken.access_token) {
        accessToken = savedToken.access_token;
      }
    } catch (e) {
      console.error('Failed to parse saved token', e);
    }
  }

  // On initial load, try to download from Drive first if we haven't already in this session
  if (!sessionStorage.getItem('has_synced_from_drive')) {
    sessionStorage.setItem('has_synced_from_drive', 'true');
    try {
      await downloadFromDrive();
    } catch (e) {
      accessToken = null;
    }
  }

  // Listen for local DB updates to trigger sync
  window.addEventListener('library_db_updated', () => {
    const savedTokenStr = db.getSetting('google_oauth_tokens');
    if (!savedTokenStr) {
      accessToken = null;
    }
    debounceSync();
  });

  window.addEventListener('force_drive_sync', () => {
    if (accessToken || isBackendConfigured) {
      syncWithDrive();
    } else {
      connectGoogleDrive();
    }
  });

  window.addEventListener('force_drive_download', () => {
    downloadFromDrive();
  });

  window.addEventListener('force_dated_backup', () => {
    if (accessToken || isBackendConfigured) {
      createDatedBackup().then(success => {
        if (success) {
          window.dispatchEvent(new CustomEvent('dated_backup_success'));
        } else {
          window.dispatchEvent(new CustomEvent('dated_backup_error'));
        }
      });
    } else {
      connectGoogleDrive();
    }
  });
}

export function connectGoogleDrive() {
  const clientId = db.getSetting('google_client_id');
  if (!clientId) {
    alert('Please set your Google Client ID in Settings first.');
    return;
  }
  
  if (!tokenClient) {
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (tokenResponse: any) => {
        if (tokenResponse && tokenResponse.access_token) {
          accessToken = tokenResponse.access_token;
          db.updateSetting('google_oauth_tokens', JSON.stringify(tokenResponse));
          syncWithDrive();
        }
      },
    });
  }
  
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function disconnectGoogleDrive() {
  accessToken = null;
  db.updateSetting('google_oauth_tokens', '');
  alert('Disconnected from Google Drive.');
}

export async function createDatedBackup() {
  const localData = db.getDatabase();
  const localJson = JSON.stringify(localData);
  const now = new Date();

  if (isBackendConfigured) {
    try {
      await fetch('/api/drive/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: localJson
      });
      console.log(`Created manual dated backup via Backend`);
      db.updateSetting('last_weekly_backup', now.toISOString(), false); // Reset weekly timer
      return true;
    } catch (err) {
      console.error('Backend backup error:', err);
      return false;
    }
  }

  if (!accessToken) return;
  
  try {
    const folderId = db.getSetting('google_drive_folder_id');
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const backupFileName = `library_db_backup_${dateStr}_${timeStr}.json`;
    
    const backupMetadata: any = {
      name: backupFileName,
      mimeType: 'application/json'
    };
    if (folderId) {
      backupMetadata.parents = [folderId];
    }

    const backupForm = new FormData();
    backupForm.append('metadata', new Blob([JSON.stringify(backupMetadata)], { type: 'application/json' }));
    backupForm.append('file', new Blob([localJson], { type: 'application/json' }));

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: backupForm
    });
    console.log(`Created manual dated backup: ${backupFileName}`);
    db.updateSetting('last_weekly_backup', now.toISOString(), false); // Reset weekly timer
    return true;
  } catch (err) {
    console.error('Manual backup error:', err);
    return false;
  }
}

let syncTimeout: any;
function debounceSync() {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncWithDrive();
  }, 5000); // 5 second debounce
}

async function syncWithDrive() {
  const localData = db.getDatabase();
  const localJson = JSON.stringify(localData);

  if (isBackendConfigured) {
    try {
      await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: localJson
      });
      console.log('Synced to Google Drive via Backend');
      db.updateSetting('last_drive_backup', new Date().toISOString(), false);
      return;
    } catch (err) {
      console.error('Backend sync error:', err);
    }
  }

  const scriptUrl = db.getSetting('google_apps_script_url');

  if (scriptUrl) {
    try {
      await fetch(`${scriptUrl}?action=write`, {
        method: 'POST',
        body: localJson,
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        }
      });
      console.log('Synced to Google Drive via Apps Script');
      db.updateSetting('last_drive_backup', new Date().toISOString(), false);
      return;
    } catch (err) {
      console.error('Apps Script sync error:', err);
    }
  }

  if (!accessToken) return;

  try {
    const folderId = db.getSetting('google_drive_folder_id');
    let query = `name='${FILE_NAME}' and trashed=false`;
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    // 1. Find the file
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!searchRes.ok) {
      if (searchRes.status === 401 || searchRes.status === 403) {
        accessToken = null;
        console.warn('Drive token expired or lacks permissions');
        return;
      }
      throw new Error('Failed to search Drive');
    }

    const searchData = await searchRes.json();
    const file = searchData.files?.[0];

    if (file) {
      const metadata = {
        name: FILE_NAME,
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([localJson], { type: 'application/json' }));

      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart&supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      });
      console.log('Synced to Google Drive (Updated)');
    } else {
      // Create new file
      const metadata: any = {
        name: FILE_NAME,
        mimeType: 'application/json'
      };
      if (folderId) {
        metadata.parents = [folderId];
      }

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([localJson], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      });
      console.log('Synced to Google Drive (Created)');
    }
    
    db.updateSetting('last_drive_backup', new Date().toISOString(), false);

    // Weekly Backup Logic
    const backupFreqDays = parseInt(db.getSetting('backup_frequency_days') || '7');
    if (!isNaN(backupFreqDays) && backupFreqDays > 0) {
      const lastWeeklyBackup = db.getSetting('last_weekly_backup');
      const now = new Date();
      let shouldBackup = false;

      if (!lastWeeklyBackup) {
        shouldBackup = true;
      } else {
        const daysSince = (now.getTime() - new Date(lastWeeklyBackup).getTime()) / (1000 * 3600 * 24);
        if (daysSince >= backupFreqDays) {
          shouldBackup = true;
        }
      }

      if (shouldBackup) {
        const dateStr = now.toISOString().split('T')[0];
        const backupFileName = `library_db_backup_${dateStr}.json`;
        
        const backupMetadata: any = {
          name: backupFileName,
          mimeType: 'application/json'
        };
        if (folderId) {
          backupMetadata.parents = [folderId];
        }

        const backupForm = new FormData();
        backupForm.append('metadata', new Blob([JSON.stringify(backupMetadata)], { type: 'application/json' }));
        backupForm.append('file', new Blob([localJson], { type: 'application/json' }));

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: backupForm
        });
        console.log(`Created weekly backup: ${backupFileName}`);
        db.updateSetting('last_weekly_backup', now.toISOString(), false);
      }
    }
  } catch (err) {
    console.error('Drive sync error:', err);
  }
}

export async function uploadImageToDrive(base64Data: string, filename: string): Promise<string | null> {
  // Use the specific folder ID requested by the user
  const folderId = '1tD6K4k2FuW3R-jzymmBRevzir1NBtXWI';

  if (isBackendConfigured) {
    try {
      const res = await fetch('/api/drive/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, filename })
      });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
    } catch (err) {
      console.error('Backend image upload error:', err);
    }
  }

  if (!accessToken) {
    console.warn('No access token for uploading image');
    return null;
  }

  try {
    const metadata = {
      name: filename,
      mimeType: 'image/jpeg',
      parents: [folderId]
    };

    // Remove prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

    // Convert base64 to Blob
    const byteString = atob(cleanBase64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: 'image/jpeg' });

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });

    if (!res.ok) {
      throw new Error('Failed to upload image');
    }

    const data = await res.json();
    const fileId = data.id;
    
    // Make the file publicly readable so it can be displayed in an img tag
    const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    if (!permRes.ok) {
      const errorData = await permRes.json();
      console.error('Failed to make file public:', errorData);
      throw new Error(`Failed to make file public: ${permRes.statusText}`);
    }

    // Return the web view link or construct a direct link
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  } catch (err) {
    console.error('Image upload error:', err);
    return null;
  }
}

export async function downloadFromDrive() {
  if (isBackendConfigured) {
    try {
      const res = await fetch('/api/drive/download');
      if (res.ok) {
        const remoteData = await res.json();
        if (remoteData && remoteData.books) {
          db.replaceDatabase(remoteData);
          console.log('Downloaded database from Google Drive via Backend');
        }
      }
      return;
    } catch (err) {
      console.error('Backend download error:', err);
    }
  }

  const scriptUrl = db.getSetting('google_apps_script_url');

  if (scriptUrl) {
    try {
      const res = await fetch(`${scriptUrl}?action=read`);
      const remoteData = await res.json();
      if (remoteData && remoteData.books) {
        db.replaceDatabase(remoteData);
        console.log('Downloaded database from Google Apps Script');
      }
      return;
    } catch (err) {
      console.error('Apps Script download error:', err);
    }
  }

  if (!accessToken) return;

  try {
    const folderId = db.getSetting('google_drive_folder_id');
    let query = `name='${FILE_NAME}' and trashed=false`;
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!searchRes.ok) {
      if (searchRes.status === 401 || searchRes.status === 403) {
        accessToken = null;
        console.warn('Drive token expired or lacks permissions');
        return;
      }
      throw new Error('Failed to search Drive');
    }

    const searchData = await searchRes.json();
    const file = searchData.files?.[0];

    if (file) {
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const remoteData = await fileRes.json();
      if (remoteData && remoteData.books) {
        db.replaceDatabase(remoteData);
        console.log('Downloaded database from Google Drive');
      }
    }
  } catch (err) {
    console.error('Drive download error:', err);
  }
}
