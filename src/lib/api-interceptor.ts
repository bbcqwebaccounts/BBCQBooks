import { db } from './db';

const originalFetch = window.fetch;

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

Object.defineProperty(window, 'fetch', {
  configurable: true,
  writable: true,
  value: async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    
    if (!urlStr.startsWith('/api/') || urlStr.startsWith('/api/drive/')) {
      return originalFetch(input, init);
    }

    const url = new URL(urlStr, window.location.origin);
    const path = url.pathname;
    const method = init?.method || 'GET';

    const jsonResponse = (data: any, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    if (path.startsWith('/api/messages')) {
      const sheetId = db.getSetting('sms_google_sheet_id') || '1_XWf2SDWptGWhcSO4rKiTiqx1W9QQ5neJMpZRmW7T4Y';
      const sheetTab = db.getSetting('sms_google_sheet_tab') || 'Log';
      const savedTokenStr = db.getSetting('google_oauth_tokens');
      let accessToken = null;
      if (savedTokenStr) {
        try {
          const savedToken = JSON.parse(savedTokenStr);
          accessToken = savedToken.access_token;
        } catch (e) {}
      }

      if (!accessToken) {
        return jsonResponse({ error: "Google Sheets is not configured. Please connect Google Drive in Settings." }, 500);
      }

      try {
        const safeTab = `'${sheetTab}'`;
        const encodedTab = encodeURIComponent(safeTab);
        if (path === '/api/messages/create-sheet' && method === 'POST') {
          const res = await originalFetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              properties: {
                title: 'Library SMS Logs'
              },
              sheets: [
                {
                  properties: {
                    title: 'Messages'
                  },
                  data: [
                    {
                      startRow: 0,
                      startColumn: 0,
                      rowData: [
                        {
                          values: [
                            { userEnteredValue: { stringValue: 'Log Time' } },
                            { userEnteredValue: { stringValue: 'First Name' } },
                            { userEnteredValue: { stringValue: 'Surname' } },
                            { userEnteredValue: { stringValue: 'Phone' } },
                            { userEnteredValue: { stringValue: 'Email' } },
                            { userEnteredValue: { stringValue: 'Scheduled Time' } },
                            { userEnteredValue: { stringValue: 'Message' } },
                            { userEnteredValue: { stringValue: 'Status' } },
                            { userEnteredValue: { stringValue: 'Batch ID' } }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            })
          });
          
          if (!res.ok) {
            const errBody = await res.text();
            console.error("Failed to create sheet:", res.status, errBody);
            throw new Error(`Failed to create Google Sheet: ${res.statusText}`);
          }
          
          const data = await res.json();
          const newSheetId = data.spreadsheetId;
          
          // Update the setting in the database
          db.updateSetting('sms_google_sheet_id', newSheetId);
          db.updateSetting('sms_google_sheet_tab', 'Messages');
          
          return jsonResponse({ success: true, sheetId: newSheetId });
        }

        if (path === '/api/messages' && method === 'GET') {
          const res = await originalFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedTab}!A:I`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!res.ok) {
            const errBody = await res.text();
            console.error("Google Sheets API Error:", res.status, res.statusText, errBody);
            if (res.status === 403 || res.status === 404) {
              throw new Error("Cannot access Google Sheet. Please check the Sheet ID in Settings and ensure your Google account has access.");
            }
            throw new Error(`Failed to fetch from Google Sheets: ${res.status} ${res.statusText}`);
          }
          const data = await res.json();
          const rows = data.values || [];
          if (rows.length === 0) return jsonResponse([]);

          const messages = rows.slice(1).map((row: any[], index: number) => ({
            rowIndex: index + 2,
            logTime: row[0] || '',
            firstName: row[1] || '',
            surname: row[2] || '',
            phone: row[3] || '',
            email: row[4] || '',
            scheduledTime: row[5] || '',
            message: row[6] || '',
            status: row[7] || '',
            batchId: row[8] || ''
          }));

          const libraryMessages = messages.filter((msg: any) => 
            msg.batchId && msg.batchId.startsWith('Library')
          );
          return jsonResponse(libraryMessages);
        }

        if (path === '/api/messages' && method === 'POST') {
          const body = JSON.parse(init?.body as string);
          const { firstName, surname, phone, email, scheduledTime, message, status, batchId } = body;
          const logTime = new Date().toLocaleString();

          const res = await originalFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedTab}!A:I:append?valueInputOption=USER_ENTERED`, {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              values: [[logTime, firstName, surname, phone, email, scheduledTime, message, status, batchId]]
            })
          });
          if (!res.ok) throw new Error('Failed to append to Google Sheets');
          return jsonResponse({ success: true });
        }

        if (path.match(/^\/api\/messages\/\d+$/) && method === 'PUT') {
          const rowIndex = path.split('/').pop();
          const body = JSON.parse(init?.body as string);
          const { scheduledTime, message, status } = body;

          const res = await originalFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedTab}!F${rowIndex}:H${rowIndex}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              values: [[scheduledTime, message, status]]
            })
          });
          if (!res.ok) throw new Error('Failed to update Google Sheets');
          return jsonResponse({ success: true });
        }

        if (path.match(/^\/api\/messages\/\d+$/) && method === 'DELETE') {
          const rowIndex = path.split('/').pop();
          
          const res = await originalFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedTab}!H${rowIndex}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              values: [['Cancelled']]
            })
          });
          if (!res.ok) throw new Error('Failed to delete in Google Sheets');
          return jsonResponse({ success: true });
        }

        if (path === '/api/messages/cancel-by-batch' && method === 'POST') {
          const body = JSON.parse(init?.body as string);
          const { batchIds } = body;
          if (!batchIds || !batchIds.length) return jsonResponse({ success: true });

          const getRes = await originalFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedTab}!A:I`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!getRes.ok) throw new Error('Failed to fetch from Google Sheets');
          const data = await getRes.json();
          const rows = data.values || [];
          
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
            const updateRes = await originalFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
              method: 'POST',
              headers: { 
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                valueInputOption: 'USER_ENTERED',
                data: dataToUpdate
              })
            });
            if (!updateRes.ok) throw new Error('Failed to batch update Google Sheets');
          }
          return jsonResponse({ success: true });
        }
      } catch (err: any) {
        console.error("Sheets API error:", err);
        return jsonResponse({ error: err.message || "Failed to fetch from Google Sheets" }, 500);
      }
    }

  try {
    // --- Books ---
    if (path === '/api/books' && method === 'GET') {
      const books = db.getBooks().map(b => {
        const activeLoans = db.getLoans().filter(l => l.book_id === b.id && !l.return_date).length;
        return { ...b, available_copies: b.total_copies - activeLoans };
      });
      return jsonResponse(books);
    }
    if (path === '/api/books' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const newBook = db.addBook({
        isbn: body.isbn,
        title: body.title,
        author: body.author,
        description: body.description || null,
        cover_url: body.cover_url || null,
        total_copies: body.total_copies || 1,
        status: body.status || 'available',
        category: body.category || null,
        shelf_number: body.shelf_number || null,
        featured: body.featured || false,
        book_code: body.book_code || null
      });
      return jsonResponse(newBook);
    }
    if (path === '/api/books/search' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() || '';
      const books = db.getBooks().filter(b => 
        b.title.toLowerCase().includes(q) || 
        b.author.toLowerCase().includes(q) || 
        b.isbn.includes(q)
      ).map(b => {
        const activeLoans = db.getLoans().filter(l => l.book_id === b.id && !l.return_date).length;
        return { ...b, available_copies: b.total_copies - activeLoans };
      });
      return jsonResponse(books);
    }

    if (path.match(/^\/api\/books\/[^\/]+$/)) {
      const isbnOrId = path.split('/').pop()!;
      if (method === 'GET') {
        const book = db.getBookByIsbn(isbnOrId);
        if (book) {
          const activeLoans = db.getLoans().filter(l => l.book_id === book.id && !l.return_date).length;
          return jsonResponse({ ...book, available_copies: book.total_copies - activeLoans });
        }
        return jsonResponse({ error: 'Not found' }, 404);
      }
      if (method === 'PUT') {
        const body = JSON.parse(init?.body as string);
        const book = db.getBookById(parseInt(isbnOrId));
        if (book) {
          const updated = db.updateBook(book.id, body);
          return jsonResponse(updated);
        }
        return jsonResponse({ error: 'Not found' }, 404);
      }
      if (method === 'DELETE') {
        db.deleteBook(parseInt(isbnOrId));
        return jsonResponse({ success: true });
      }
    }

    // --- Loans ---
    if (path === '/api/loans' && method === 'GET') {
      const loans = db.getLoans().map(l => {
        const book = db.getBookById(l.book_id);
        return {
          ...l,
          title: book?.title || 'Unknown Book',
          isbn: book?.isbn || '',
          is_overdue: !l.return_date && new Date(l.due_date) < new Date() ? 1 : 0
        };
      });
      return jsonResponse(loans);
    }
    if (path === '/api/loans' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const newLoans = [];
      for (const isbn of body.isbns) {
        const book = db.getBookByIsbn(isbn);
        if (book) {
          const loan = db.addLoan({
            book_id: book.id,
            user_name: body.user_name,
            user_phone: body.user_phone,
            user_email: body.user_email || null,
            borrow_date: new Date().toISOString(),
            due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            original_due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            return_date: null,
            extension_token: generateId(),
            last_overdue_notice: null
          });
          newLoans.push(loan);
        }
      }
      return jsonResponse(newLoans);
    }
    if (path === '/api/loans/active' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() || '';
      const activeLoans = db.getLoans().filter(l => !l.return_date && (
        l.user_name.toLowerCase().includes(q) ||
        l.user_phone.includes(q) ||
        (l.user_email && l.user_email.toLowerCase().includes(q))
      )).map(l => {
        const book = db.getBookById(l.book_id);
        return {
          ...l,
          title: book?.title || 'Unknown Book',
          isbn: book?.isbn || '',
          is_overdue: new Date(l.due_date) < new Date() ? 1 : 0
        };
      });
      return jsonResponse(activeLoans);
    }
    if (path === '/api/borrow' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const newLoans = [];
      const weeks = body.weeks || 2;
      
      const template = db.getSetting('sms_reminder_template') || "Hi {name}, just a friendly reminder that your book '{title}' is due back at the library on {due_date}. You can extend your loan here: {url}";
      const offsetDays = parseInt(db.getSetting('sms_reminder_offset_days') || "2");
      const reminderEnabled = db.getSetting('sms_reminder_enabled') !== 'false';

      for (const isbn of body.isbns) {
        const book = db.getBookByIsbn(isbn);
        if (book) {
          const dueDateStr = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
          const loan = db.addLoan({
            book_id: book.id,
            user_name: body.user_name,
            user_phone: body.user_phone,
            user_email: body.user_email || null,
            borrow_date: new Date().toISOString(),
            due_date: dueDateStr,
            original_due_date: dueDateStr,
            return_date: null,
            extension_token: generateId(),
            last_overdue_notice: null
          });
          
          const dueDate = new Date(dueDateStr);
          const scheduledDate = new Date(dueDate);
          scheduledDate.setDate(scheduledDate.getDate() - offsetDays);
          scheduledDate.setHours(10, 0, 0, 0);
          const scheduledTimeStr = `${scheduledDate.getDate().toString().padStart(2, '0')}/${(scheduledDate.getMonth() + 1).toString().padStart(2, '0')}/${scheduledDate.getFullYear()} ${scheduledDate.getHours().toString().padStart(2, '0')}:${scheduledDate.getMinutes().toString().padStart(2, '0')}:${scheduledDate.getSeconds().toString().padStart(2, '0')}`;
          
          const [firstName] = loan.user_name.split(' ');
          const extensionUrl = `https://bbcqbooks.pages.dev/extend?token=${loan.extension_token}`;
          const message = template
            .replace('{name}', firstName)
            .replace('{title}', book.title)
            .replace('{due_date}', dueDate.toLocaleDateString())
            .replace('{url}', extensionUrl);

          newLoans.push({
            ...loan,
            sms_scheduled_time: reminderEnabled ? scheduledTimeStr : null,
            sms_message: reminderEnabled ? message : null
          });
        }
      }
      return jsonResponse(newLoans);
    }
    if (path === '/api/return' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const returned = [];
      for (const isbn of body.isbns) {
        const book = db.getBookByIsbn(isbn);
        if (book) {
          const loan = db.getLoans().find(l => l.book_id === book.id && !l.return_date);
          if (loan) {
            const updated = db.updateLoan(loan.id, { return_date: new Date().toISOString() });
            returned.push(updated);
          }
        }
      }
      return jsonResponse(returned);
    }
    if (path === '/api/extend' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const extended = [];
      
      const template = db.getSetting('sms_reminder_template') || "Hi {name}, just a friendly reminder that your book '{title}' is due back at the library on {due_date}. You can extend your loan here: {url}";
      const offsetDays = parseInt(db.getSetting('sms_reminder_offset_days') || "2");
      const reminderEnabled = db.getSetting('sms_reminder_enabled') !== 'false';

      for (const token of body.tokens) {
        const loan = db.getLoanByToken(token);
        if (loan) {
          const newDueDate = new Date(loan.due_date);
          newDueDate.setDate(newDueDate.getDate() + 7);
          const updated = db.updateLoan(loan.id, { due_date: newDueDate.toISOString() });
          
          const book = db.getBookById(updated.book_id);
          const title = book?.title || 'Unknown Book';
          
          const scheduledDate = new Date(newDueDate);
          scheduledDate.setDate(scheduledDate.getDate() - offsetDays);
          scheduledDate.setHours(10, 0, 0, 0);
          const scheduledTimeStr = `${scheduledDate.getDate().toString().padStart(2, '0')}/${(scheduledDate.getMonth() + 1).toString().padStart(2, '0')}/${scheduledDate.getFullYear()} ${scheduledDate.getHours().toString().padStart(2, '0')}:${scheduledDate.getMinutes().toString().padStart(2, '0')}:${scheduledDate.getSeconds().toString().padStart(2, '0')}`;
          
          const [firstName] = updated.user_name.split(' ');
          const extensionUrl = `https://bbcqbooks.pages.dev/extend?token=${updated.extension_token}`;
          const message = template
            .replace('{name}', firstName)
            .replace('{title}', title)
            .replace('{due_date}', newDueDate.toLocaleDateString())
            .replace('{url}', extensionUrl);

          extended.push({
            ...updated,
            title,
            sms_scheduled_time: reminderEnabled ? scheduledTimeStr : null,
            sms_message: reminderEnabled ? message : null
          });
        }
      }
      return jsonResponse({
        message: `Successfully extended ${extended.length} loan(s).`,
        results: extended
      });
    }
    if (path.match(/^\/api\/loans\/suggestions\/[^\/]+$/) && method === 'GET') {
      const isbn = path.split('/').pop()!;
      const book = db.getBookByIsbn(isbn);
      if (book) {
        const activeLoans = db.getLoans().filter(l => l.book_id === book.id && !l.return_date);
        return jsonResponse(activeLoans);
      }
      return jsonResponse([]);
    }
    if (path.match(/^\/api\/loans\/\d+\/return$/) && method === 'POST') {
      const id = parseInt(path.split('/')[3]);
      const updated = db.updateLoan(id, { return_date: new Date().toISOString() });
      
      // Attempt to cancel SMS reminder via API
      try {
        fetch('/api/messages/cancel-by-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchIds: [`Library-${id}`] })
        }).catch(err => console.error('Failed to cancel SMS reminder:', err));
      } catch (e) {
        // Ignore errors
      }
      
      return jsonResponse(updated);
    }
    if (path.match(/^\/api\/loans\/\d+\/extend$/) && method === 'POST') {
      const id = parseInt(path.split('/')[3]);
      const loan = db.getLoanById(id);
      if (loan) {
        const newDueDate = new Date(loan.due_date);
        newDueDate.setDate(newDueDate.getDate() + 7);
        const updated = db.updateLoan(id, { due_date: newDueDate.toISOString() });
        
        const template = db.getSetting('sms_reminder_template') || "Hi {name}, just a friendly reminder that your book '{title}' is due back at the library on {due_date}. You can extend your loan here: {url}";
        const offsetDays = parseInt(db.getSetting('sms_reminder_offset_days') || "2");
        
        const book = db.getBookById(updated.book_id);
        const title = book?.title || 'Unknown Book';
        
        const scheduledDate = new Date(newDueDate);
        scheduledDate.setDate(scheduledDate.getDate() - offsetDays);
        scheduledDate.setHours(10, 0, 0, 0);
        const scheduledTimeStr = `${scheduledDate.getDate().toString().padStart(2, '0')}/${(scheduledDate.getMonth() + 1).toString().padStart(2, '0')}/${scheduledDate.getFullYear()} ${scheduledDate.getHours().toString().padStart(2, '0')}:${scheduledDate.getMinutes().toString().padStart(2, '0')}:${scheduledDate.getSeconds().toString().padStart(2, '0')}`;
        
        const [firstName] = updated.user_name.split(' ');
        const extensionUrl = `https://bbcqbooks.pages.dev/extend?token=${updated.extension_token}`;
        const message = template
          .replace('{name}', firstName)
          .replace('{title}', title)
          .replace('{due_date}', newDueDate.toLocaleDateString())
          .replace('{url}', extensionUrl);

        return jsonResponse({
          ...updated,
          title,
          sms_scheduled_time: scheduledTimeStr,
          sms_message: message
        });
      }
      return jsonResponse({ error: 'Not found' }, 404);
    }

    // --- Members ---
    if (path === '/api/members' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() || '';
      const members = db.getMembers().filter(m => 
        m.full_name.toLowerCase().includes(q) || m.phone.includes(q)
      );
      return jsonResponse(members);
    }
    if (path === '/api/members/all' && method === 'GET') {
      return jsonResponse(db.getMembers());
    }

    // --- Settings ---
    if (path === '/api/settings' && method === 'GET') {
      return jsonResponse({
        settings: db.getSettings(),
        googleConnected: !!db.getSetting('google_oauth_tokens'),
        refreshToken: null
      });
    }
    if (path === '/api/settings' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      for (const s of body.settings) {
        db.updateSetting(s.key, s.value);
      }
      return jsonResponse({ success: true });
    }

    // --- Admin Analytics ---
    if (path === '/api/admin/analytics' && method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '30');
      const loans = db.getLoans();
      const books = db.getBooks();
      
      const currentlyBorrowed = loans.filter(l => !l.return_date).length;
      const overdue = loans.filter(l => !l.return_date && new Date(l.due_date) < new Date()).length;
      
      // Calculate top category
      const categoryCounts: Record<string, number> = {};
      loans.forEach(l => {
        const book = books.find(b => b.id === l.book_id);
        if (book && book.category) {
          categoryCounts[book.category] = (categoryCounts[book.category] || 0) + 1;
        }
      });
      const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0] || ['None', 0];

      // Calculate top borrower
      const borrowerCounts: Record<string, number> = {};
      loans.forEach(l => {
        borrowerCounts[l.user_name] = (borrowerCounts[l.user_name] || 0) + 1;
      });
      const topBorrower = Object.entries(borrowerCounts).sort((a, b) => b[1] - a[1])[0] || ['None', 0];

      // Calculate top book
      const bookCounts: Record<number, number> = {};
      loans.forEach(l => {
        bookCounts[l.book_id] = (bookCounts[l.book_id] || 0) + 1;
      });
      const topBookId = parseInt(Object.entries(bookCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '0');
      const topBookTitle = books.find(b => b.id === topBookId)?.title || 'None';
      const topBookCount = bookCounts[topBookId] || 0;

      // Borrows over time (last N days)
      const borrowsOverTime = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const count = loans.filter(l => l.borrow_date.startsWith(dateStr)).length;
        borrowsOverTime.push({ date: dateStr, count });
      }

      // Category stats
      const categoryStats = Object.entries(categoryCounts).map(([name, value]) => ({ name, value }));

      return jsonResponse({
        stats: {
          currentlyBorrowed,
          overdue,
          topCategory: { name: topCategory[0], count: topCategory[1] },
          topBorrower: { name: topBorrower[0], count: topBorrower[1] },
          topBook: { title: topBookTitle, count: topBookCount }
        },
        borrowsOverTime,
        categoryStats
      });
    }

    // --- Admin Login ---
    if (path === '/api/admin/login' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const adminPassword = db.getSetting('ADMIN_PASSWORD') || process.env.ADMIN_PASSWORD || 'bbcqbooks';
      if (body.password === adminPassword) {
        return jsonResponse({ success: true });
      }
      return jsonResponse({ error: 'Invalid password' }, 401);
    }

    // --- Extend Info ---
    if (path.match(/^\/api\/extend-info\/[^\/]+$/) && method === 'GET') {
      const token = path.split('/').pop()!;
      const targetLoan = db.getLoanByToken(token);
      if (!targetLoan) return jsonResponse({ error: 'Invalid token' }, 404);
      
      const book = db.getBookById(targetLoan.book_id);
      const otherLoans = db.getLoans().filter(l => 
        l.user_phone === targetLoan.user_phone && 
        !l.return_date && 
        l.id !== targetLoan.id
      ).map(l => ({
        ...l,
        title: db.getBookById(l.book_id)?.title || 'Unknown Book'
      }));

      return jsonResponse({
        targetLoan: { ...targetLoan, title: book?.title },
        otherLoans
      });
    }

    // --- Messages ---
    if (path === '/api/messages' && method === 'GET') {
      return jsonResponse([]);
    }
    if (path.match(/^\/api\/messages\/\d+$/)) {
      if (method === 'PUT' || method === 'DELETE') {
        return jsonResponse({ success: true });
      }
    }

    // --- Mock Drive Backup ---
    if (path === '/api/admin/backup/drive' && method === 'POST') {
      // We trigger the client-side drive sync instead
      window.dispatchEvent(new CustomEvent('force_drive_sync'));
      return jsonResponse({ success: true });
    }

    if (path === '/api/sync-from-drive' && method === 'POST') {
      // In a real client-side app, this would trigger downloadFromDrive()
      // We can dispatch an event for drive-sync.ts to handle
      window.dispatchEvent(new CustomEvent('force_drive_download'));
      return jsonResponse({ success: true });
    }

    // --- Local Backup & Restore ---
    if (path === '/api/admin/backup' && method === 'GET') {
      return jsonResponse(db.getDatabase());
    }
    if (path === '/api/admin/restore' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const data = body.data || body; // Handle both { data: {...} } and direct {...}
      if (data.books && data.loans && data.members && data.settings) {
        db.replaceDatabase(data);
        return jsonResponse({ success: true });
      }
      return jsonResponse({ error: 'Invalid backup format' }, 400);
    }

    // Fallback
    console.warn(`Unmocked API route: ${method} ${path}`);
    return jsonResponse({ error: 'Not implemented in client-side mock' }, 404);

  } catch (err: any) {
    console.error(`Mock API Error (${method} ${path}):`, err);
    return jsonResponse({ error: err.message }, 500);
  }
}
});
