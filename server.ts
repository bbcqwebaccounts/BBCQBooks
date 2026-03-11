import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const FILE_NAME = 'library_db.json';

let driveClient: any = null;
let sheetsClient: any = null;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN) {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground" // standard redirect
  );

  oauth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN
  });

  driveClient = google.drive({ version: 'v3', auth: oauth2Client });
  sheetsClient = google.sheets({ version: 'v4', auth: oauth2Client });
}

// API routes FIRST
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", driveConfigured: !!driveClient });
});

app.get("/api/drive/download", async (req, res) => {
  if (!driveClient) {
    return res.status(500).json({ error: "Google Drive is not configured on the server." });
  }

  try {
    let query = `name='${FILE_NAME}' and trashed=false`;
    if (GOOGLE_DRIVE_FOLDER_ID) {
      query += ` and '${GOOGLE_DRIVE_FOLDER_ID}' in parents`;
    }

    const searchRes = await driveClient.files.list({
      q: query,
      spaces: 'drive',
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const file = searchRes.data.files?.[0];

    if (!file) {
      return res.status(404).json({ error: "Database file not found in Drive." });
    }

    const fileRes = await driveClient.files.get({
      fileId: file.id,
      alt: 'media',
      supportsAllDrives: true
    }, { responseType: 'json' });

    res.json(fileRes.data);
  } catch (err: any) {
    console.error("Drive download error:", err);
    res.status(500).json({ error: "Failed to download from Drive: " + err.message });
  }
});

app.post("/api/drive/upload", async (req, res) => {
  if (!driveClient) {
    return res.status(500).json({ error: "Google Drive is not configured on the server." });
  }

  try {
    const localData = req.body;
    let query = `name='${FILE_NAME}' and trashed=false`;
    if (GOOGLE_DRIVE_FOLDER_ID) {
      query += ` and '${GOOGLE_DRIVE_FOLDER_ID}' in parents`;
    }

    const searchRes = await driveClient.files.list({
      q: query,
      spaces: 'drive',
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const file = searchRes.data.files?.[0];

    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(localData)
    };

    if (file) {
      await driveClient.files.update({
        fileId: file.id,
        media: media,
        supportsAllDrives: true
      });
      res.json({ success: true, message: "Updated existing file in Drive." });
    } else {
      const fileMetadata: any = {
        name: FILE_NAME,
        mimeType: 'application/json'
      };
      if (GOOGLE_DRIVE_FOLDER_ID) {
        fileMetadata.parents = [GOOGLE_DRIVE_FOLDER_ID];
      }
      await driveClient.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
        supportsAllDrives: true
      });
      res.json({ success: true, message: "Created new file in Drive." });
    }
  } catch (err: any) {
    console.error("Drive upload error:", err);
    res.status(500).json({ error: "Failed to upload to Drive: " + err.message });
  }
});

app.post("/api/drive/upload-image", async (req, res) => {
  if (!driveClient) {
    return res.status(500).json({ error: "Google Drive is not configured on the server." });
  }

  try {
    const { base64Data, filename } = req.body;
    const folderId = '1tD6K4k2FuW3R-jzymmBRevzir1NBtXWI';

    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const fileMetadata: any = {
      name: filename,
      mimeType: 'image/jpeg',
      parents: [folderId]
    };

    const media = {
      mimeType: 'image/jpeg',
      body: require('stream').Readable.from(buffer)
    };

    const file = await driveClient.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
      supportsAllDrives: true
    });

    const fileId = file.data.id;

    await driveClient.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      },
      supportsAllDrives: true
    });

    res.json({ url: `https://drive.google.com/uc?id=${fileId}` });
  } catch (err: any) {
    console.error("Image upload error:", err);
    res.status(500).json({ error: "Failed to upload image to Drive: " + err.message });
  }
});

app.post("/api/drive/backup", async (req, res) => {
  if (!driveClient) {
    return res.status(500).json({ error: "Google Drive is not configured on the server." });
  }

  try {
    const localData = req.body;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const backupFileName = `library_db_backup_${dateStr}_${timeStr}.json`;

    const fileMetadata: any = {
      name: backupFileName,
      mimeType: 'application/json'
    };
    if (GOOGLE_DRIVE_FOLDER_ID) {
      fileMetadata.parents = [GOOGLE_DRIVE_FOLDER_ID];
    }

    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(localData)
    };

    await driveClient.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
      supportsAllDrives: true
    });
    
    res.json({ success: true, message: `Created backup file: ${backupFileName}` });
  } catch (err: any) {
    console.error("Drive backup error:", err);
    res.status(500).json({ error: "Failed to create backup in Drive: " + err.message });
  }
});

app.get("/api/messages", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  const spreadsheetId = req.headers['x-spreadsheet-id'] as string || '1_XWf2SDWptGWhcSO4rKiTiqx1W9QQ5neJMpZRmW7T4Y';
  const sheetName = req.headers['x-sheet-name'] as string || 'Log';

  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A:I`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.json([]);
    }

    const headers = rows[0];
    const messages = rows.slice(1).map((row: any[], index: number) => {
      return {
        rowIndex: index + 2, // +2 because 1-indexed and header row
        logTime: row[0] || '',
        firstName: row[1] || '',
        surname: row[2] || '',
        phone: row[3] || '',
        email: row[4] || '',
        scheduledTime: row[5] || '',
        message: row[6] || '',
        status: row[7] || '',
        batchId: row[8] || ''
      };
    });

    // Filter to only include library related messages
    const libraryMessages = messages.filter((msg: any) => 
      msg.message.toLowerCase().includes('library') || 
      msg.message.toLowerCase().includes('bbcqbooks') ||
      msg.message.toLowerCase().includes('book')
    );

    res.json(libraryMessages);
  } catch (err: any) {
    console.error("Sheets fetch error:", err);
    res.status(500).json({ error: "Failed to fetch messages from Sheets: " + err.message });
  }
});

app.post("/api/messages", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  const spreadsheetId = req.headers['x-spreadsheet-id'] as string || '1_XWf2SDWptGWhcSO4rKiTiqx1W9QQ5neJMpZRmW7T4Y';
  const sheetName = req.headers['x-sheet-name'] as string || 'Log';

  try {
    const { firstName, surname, phone, email, scheduledTime, message, status, batchId } = req.body;
    const logTime = new Date().toLocaleString();

    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[logTime, firstName, surname, phone, email, scheduledTime, message, status, batchId]]
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Sheets append error:", err);
    res.status(500).json({ error: "Failed to append message to Sheets: " + err.message });
  }
});

app.put("/api/messages/:rowIndex", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  const spreadsheetId = req.headers['x-spreadsheet-id'] as string || '1_XWf2SDWptGWhcSO4rKiTiqx1W9QQ5neJMpZRmW7T4Y';
  const sheetName = req.headers['x-sheet-name'] as string || 'Log';

  try {
    const { rowIndex } = req.params;
    const { status } = req.body;

    // Update the status column (H)
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!H${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[status]]
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Sheets update error:", err);
    res.status(500).json({ error: "Failed to update message in Sheets: " + err.message });
  }
});

app.delete("/api/messages/:rowIndex", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  const spreadsheetId = req.headers['x-spreadsheet-id'] as string || '1_XWf2SDWptGWhcSO4rKiTiqx1W9QQ5neJMpZRmW7T4Y';
  const sheetName = req.headers['x-sheet-name'] as string || 'Log';

  try {
    const { rowIndex } = req.params;
    
    // We can't easily delete a row without using batchUpdate, so we'll just mark it as Cancelled
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!H${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Cancelled']]
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Sheets delete error:", err);
    res.status(500).json({ error: "Failed to delete message in Sheets: " + err.message });
  }
});

app.post("/api/messages/cancel-by-batch", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  const spreadsheetId = req.headers['x-spreadsheet-id'] as string || '1_XWf2SDWptGWhcSO4rKiTiqx1W9QQ5neJMpZRmW7T4Y';
  const sheetName = req.headers['x-sheet-name'] as string || 'Log';

  try {
    const { batchIds } = req.body;
    if (!batchIds || !batchIds.length) {
      return res.json({ success: true });
    }

    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A:I`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.json({ success: true });
    }

    const updates = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = row[7];
      const batchId = row[8];
      
      if (batchIds.includes(batchId) && status === 'Queued') {
        updates.push({
          range: `${sheetName}!H${i + 1}`,
          values: [['Cancelled']]
        });
      }
    }

    if (updates.length > 0) {
      await sheetsClient.spreadsheets.values.batchUpdate({
        spreadsheetId: spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });
    }

    res.json({ success: true, updatedCount: updates.length });
  } catch (err: any) {
    console.error("Sheets cancel error:", err);
    res.status(500).json({ error: "Failed to cancel messages in Sheets: " + err.message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
