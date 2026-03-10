import { db } from './db';

const SCOPES = 'https://www.googleapis.com/auth/drive';
const FILE_NAME = 'library_db.json';

let tokenClient: any;
let accessToken: string | null = null;

export async function initDriveSync() {
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
    downloadFromDrive().catch(() => {
      accessToken = null;
    });
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
    if (accessToken) {
      syncWithDrive();
    } else {
      connectGoogleDrive();
    }
  });

  window.addEventListener('force_drive_download', () => {
    downloadFromDrive();
  });

  window.addEventListener('force_dated_backup', () => {
    if (accessToken) {
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
  if (!accessToken) return;
  
  try {
    const folderId = db.getSetting('google_drive_folder_id');
    const localData = db.getDatabase();
    const localJson = JSON.stringify(localData);
    
    const now = new Date();
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

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
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
  const scriptUrl = db.getSetting('google_apps_script_url');
  const localData = db.getDatabase();
  const localJson = JSON.stringify(localData);

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
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive`, {
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

      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart`, {
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

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
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

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
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

export async function downloadFromDrive() {
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

    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive`, {
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
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
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
