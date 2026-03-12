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

  try {
    const sheetId = req.headers['x-sheet-id'] as string;
    const sheetTab = req.headers['x-sheet-tab'] as string;
    
    if (!sheetId || !sheetTab) {
      return res.status(400).json({ error: "Missing sheet ID or tab in headers." });
    }

    const safeTab = `'${sheetTab}'`;
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${safeTab}!A:J`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) return res.json([]);

    const messages = rows.map((row: any[], index: number) => ({
      rowIndex: index + 1,
      logTime: row[0] != null ? String(row[0]) : '',
      firstName: row[1] != null ? String(row[1]) : '',
      surname: row[2] != null ? String(row[2]) : '',
      phone: row[3] != null ? String(row[3]) : '',
      email: row[4] != null ? String(row[4]) : '',
      scheduledTime: row[5] != null ? String(row[5]) : '',
      message: row[6] != null ? String(row[6]) : '',
      status: row[7] != null ? String(row[7]) : '',
      batchId: row[8] != null ? String(row[8]) : ''
    }));

    const validMessages = messages.filter((msg: any) => 
      (msg.phone || msg.scheduledTime || msg.message) &&
      String(msg.logTime).toLowerCase() !== 'log time' &&
      String(msg.logTime).toLowerCase() !== 'logtime'
    );
    
    res.json(validMessages);
  } catch (err: any) {
    console.error("Sheets API error:", err);
    res.status(500).json({ error: "Failed to fetch from Google Sheets: " + err.message });
  }
});

app.post("/api/messages", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  try {
    const sheetId = req.headers['x-sheet-id'] as string;
    const sheetTab = req.headers['x-sheet-tab'] as string;
    
    if (!sheetId || !sheetTab) {
      return res.status(400).json({ error: "Missing sheet ID or tab in headers." });
    }

    const { firstName, surname, phone, email, scheduledTime, message, status, batchId } = req.body;
    const logTime = new Date().toLocaleString();
    const safeTab = `'${sheetTab}'`;

    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${safeTab}!A:J`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[logTime, firstName, surname, phone, email, scheduledTime, message, status, batchId]]
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Sheets API error:", err);
    res.status(500).json({ error: "Failed to append to Google Sheets: " + err.message });
  }
});

app.put("/api/messages/:id", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  try {
    const sheetId = req.headers['x-sheet-id'] as string;
    const sheetTab = req.headers['x-sheet-tab'] as string;
    
    if (!sheetId || !sheetTab) {
      return res.status(400).json({ error: "Missing sheet ID or tab in headers." });
    }

    const rowIndex = req.params.id;
    const { scheduledTime, message, status } = req.body;
    const safeTab = `'${sheetTab}'`;

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${safeTab}!F${rowIndex}:H${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[scheduledTime, message, status]]
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Sheets API error:", err);
    res.status(500).json({ error: "Failed to update Google Sheets: " + err.message });
  }
});

app.delete("/api/messages/:id", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  try {
    const sheetId = req.headers['x-sheet-id'] as string;
    const sheetTab = req.headers['x-sheet-tab'] as string;
    
    if (!sheetId || !sheetTab) {
      return res.status(400).json({ error: "Missing sheet ID or tab in headers." });
    }

    const rowIndex = req.params.id;
    const safeTab = `'${sheetTab}'`;

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${safeTab}!H${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Cancelled']]
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Sheets API error:", err);
    res.status(500).json({ error: "Failed to cancel message in Google Sheets: " + err.message });
  }
});

app.post("/api/messages/cancel-by-batch", async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: "Google Sheets is not configured on the server." });
  }

  try {
    const sheetId = req.headers['x-sheet-id'] as string;
    const sheetTab = req.headers['x-sheet-tab'] as string;
    
    if (!sheetId || !sheetTab) {
      return res.status(400).json({ error: "Missing sheet ID or tab in headers." });
    }

    const { batchIds } = req.body;
    if (!batchIds || !batchIds.length) return res.json({ success: true });

    const safeTab = `'${sheetTab}'`;
    const getRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${safeTab}!A:J`,
    });

    const rows = getRes.data.values || [];
    const dataToUpdate = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = row[7];
      const batchId = row[8];
      
      if (batchIds.includes(batchId) && status === 'Queued') {
        dataToUpdate.push({
          range: `${safeTab}!H${i + 1}`,
          values: [['Cancelled']]
        });
      }
    }

    if (dataToUpdate.length > 0) {
      await sheetsClient.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: dataToUpdate
        }
      });
    }
    
    res.json({ success: true });
  } catch (err: any) {
    console.error("Sheets API error:", err);
    res.status(500).json({ error: "Failed to batch cancel messages in Google Sheets: " + err.message });
  }
});

app.get("/api/cron/weekly-overdue", async (req, res) => {
  if (!driveClient || !sheetsClient) {
    return res.status(500).json({ error: "Google Drive/Sheets is not configured on the server." });
  }

  try {
    // 1. Download library_db.json
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

    const db = fileRes.data;
    const settings = db.settings || [];
    const getSetting = (key: string) => settings.find((s: any) => s.key === key)?.value;

    const sheetId = getSetting('google_sheet_id');
    const sheetTab = getSetting('google_sheet_tab');

    if (!sheetId || !sheetTab) {
      return res.status(400).json({ error: "Google Sheet ID or Tab not configured in database settings." });
    }

    const loans = db.loans || [];
    const books = db.books || [];
    const members = db.members || [];

    const now = new Date();
    // Reset time to start of day for accurate comparison
    now.setHours(0, 0, 0, 0);

    const overdueLoans = loans.filter((loan: any) => {
      if (loan.status !== 'borrowed') return false;
      const dueDate = new Date(loan.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < now;
    });

    if (overdueLoans.length === 0) {
      return res.json({ success: true, message: "No overdue loans found." });
    }

    const messagesToAppend = [];
    const logTime = new Date().toLocaleString();
    const safeTab = `'${sheetTab}'`;

    // We need the base URL for the extension link.
    // Use the host from the request to build the full URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${req.get('host')}`;

    for (const loan of overdueLoans) {
      const member = members.find((m: any) => m.id === loan.memberId);
      const book = books.find((b: any) => b.id === loan.bookId);

      if (!member || !book || !member.phone) continue;

      const extensionUrl = `${baseUrl}/extend?token=${loan.extension_token}`;
      
      // Generate message
      const message = `Hi ${member.firstName}, your book '${book.title}' is now overdue. Please return it to the library. Need more time? Extend your loan by 1 week here: ${extensionUrl}`;

      // Schedule for immediate sending
      const scheduledTime = new Date().toLocaleString();

      messagesToAppend.push([
        logTime,
        member.firstName,
        member.surname,
        member.phone,
        member.email || '',
        scheduledTime,
        message,
        'Queued',
        `Library-Overdue-${loan.id}-${Date.now()}` // Unique batch ID
      ]);
    }

    if (messagesToAppend.length > 0) {
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${safeTab}!A:J`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: messagesToAppend
        }
      });
    }

    res.json({ 
      success: true, 
      message: `Processed ${overdueLoans.length} overdue loans. Queued ${messagesToAppend.length} SMS messages.` 
    });

  } catch (err: any) {
    console.error("Cron job error:", err);
    res.status(500).json({ error: "Failed to process overdue cron job: " + err.message });
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
