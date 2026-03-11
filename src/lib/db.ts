export interface Book {
  id: number;
  isbn: string;
  title: string;
  author: string;
  description: string | null;
  cover_url: string | null;
  total_copies: number;
  status: string;
  category: string | null;
  shelf_number: string | null;
  featured: boolean;
  book_code: string | null;
}

export interface Loan {
  id: number;
  book_id: number;
  user_name: string;
  user_phone: string;
  user_email: string | null;
  borrow_date: string;
  due_date: string;
  original_due_date: string | null;
  return_date: string | null;
  extension_token: string | null;
  last_overdue_notice: string | null;
}

export interface Member {
  id: number;
  first_name: string;
  surname: string;
  full_name: string;
  phone: string;
  email: string | null;
  last_synced: string | null;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Database {
  books: Book[];
  loans: Loan[];
  members: Member[];
  settings: Setting[];
}

const defaultSettings: Setting[] = [
  { key: 'sms_confirmation_template', value: "Hi {name}, you've borrowed '{title}'. Due on {due_date}." },
  { key: 'sms_return_template', value: "Hi {name}, thanks for returning '{title}'." },
  { key: 'sms_overdue_template', value: "Hi {name}, '{title}' is overdue. Please return it ASAP." },
  { key: 'sms_reminder_template', value: "Hi {name}, just a friendly reminder that your book '{title}' is due back at the library on {due_date}. You can extend your loan here: {url}" },
  { key: 'sms_reminder_offset_days', value: "2" },
  { key: 'sms_google_sheet_id', value: "1_XWf2SDWptGWhcSO4rKiTiqx1W9QQ5neJMpZRmW7T4Y" },
  { key: 'sms_google_sheet_tab', value: "Log" },
  { key: 'ADMIN_PASSWORD', value: "bbcqbooks" },
  { key: 'max_borrow_weeks', value: "4" },
  { key: 'google_client_id', value: import.meta.env.VITE_GOOGLE_CLIENT_ID || "537860369463-cbstki1j76jbg666an30gb5kcnivn860.apps.googleusercontent.com" },
  { key: 'google_apps_script_url', value: import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbzQZ7XSZjYzLVO7w4Lw62QbPLD1oC4dsRLEvasX5DE2fe1D-xm2iCMsjJxNyq4295lH/exec" },
  { key: 'google_drive_folder_id', value: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || "1tD6K4k2FuW3R-jzymmBRevzir1NBtXWI" },
  { key: 'backup_frequency_days', value: "7" }
];

class LocalDB {
  private data: Database = {
    books: [],
    loans: [],
    members: [],
    settings: defaultSettings
  };

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const stored = localStorage.getItem('library_db');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.data = { ...this.data, ...parsed };
        
        // Ensure default settings exist
        defaultSettings.forEach(ds => {
          if (!this.data.settings.find(s => s.key === ds.key)) {
            this.data.settings.push(ds);
          }
        });
      } catch (e) {
        console.error("Failed to parse local DB", e);
      }
    }
  }

  private saveToStorage(triggerSync: boolean = true) {
    localStorage.setItem('library_db', JSON.stringify(this.data));
    if (triggerSync) {
      // Trigger a sync to Drive if connected
      window.dispatchEvent(new CustomEvent('library_db_updated'));
    }
  }

  // --- Books ---
  getBooks() { return this.data.books; }
  getBookByIsbn(isbn: string) { return this.data.books.find(b => b.isbn === isbn); }
  getBookById(id: number) { return this.data.books.find(b => b.id === id); }
  addBook(book: Omit<Book, 'id'>) {
    const id = Math.max(0, ...this.data.books.map(b => b.id)) + 1;
    const newBook = { ...book, id };
    this.data.books.push(newBook);
    this.saveToStorage();
    return newBook;
  }
  updateBook(id: number, updates: Partial<Book>) {
    const index = this.data.books.findIndex(b => b.id === id);
    if (index !== -1) {
      this.data.books[index] = { ...this.data.books[index], ...updates };
      this.saveToStorage();
      return this.data.books[index];
    }
    return null;
  }
  deleteBook(id: number) {
    this.data.books = this.data.books.filter(b => b.id !== id);
    this.saveToStorage();
  }

  // --- Loans ---
  getLoans() { return this.data.loans; }
  getLoanById(id: number) { return this.data.loans.find(l => l.id === id); }
  getLoanByToken(token: string) { return this.data.loans.find(l => l.extension_token === token); }
  addLoan(loan: Omit<Loan, 'id'>) {
    const id = Math.max(0, ...this.data.loans.map(l => l.id)) + 1;
    const newLoan = { ...loan, id };
    this.data.loans.push(newLoan);
    this.saveToStorage();
    return newLoan;
  }
  updateLoan(id: number, updates: Partial<Loan>) {
    const index = this.data.loans.findIndex(l => l.id === id);
    if (index !== -1) {
      this.data.loans[index] = { ...this.data.loans[index], ...updates };
      this.saveToStorage();
      return this.data.loans[index];
    }
    return null;
  }

  // --- Members ---
  getMembers() { return this.data.members; }
  addMember(member: Omit<Member, 'id'>) {
    const id = Math.max(0, ...this.data.members.map(m => m.id)) + 1;
    const newMember = { ...member, id };
    this.data.members.push(newMember);
    this.saveToStorage();
    return newMember;
  }

  // --- Settings ---
  getSettings() { 
    return this.data.settings.map(s => {
      if (!s.value) {
        const defaultSetting = defaultSettings.find(ds => ds.key === s.key);
        if (defaultSetting && defaultSetting.value) {
          return { ...s, value: defaultSetting.value };
        }
      }
      return s;
    });
  }
  getSetting(key: string) { 
    const val = this.data.settings.find(s => s.key === key)?.value; 
    if (!val) {
      return defaultSettings.find(s => s.key === key)?.value || "";
    }
    return val;
  }
  updateSetting(key: string, value: string, triggerSync: boolean = true) {
    const index = this.data.settings.findIndex(s => s.key === key);
    if (index !== -1) {
      this.data.settings[index].value = value;
    } else {
      this.data.settings.push({ key, value });
    }
    this.saveToStorage(triggerSync);
  }

  // --- Full DB Replace (for Drive Sync) ---
  replaceDatabase(newData: Database) {
    this.data = newData;
    this.saveToStorage(false); // Do not trigger sync when replacing from remote
    window.dispatchEvent(new CustomEvent('library_db_replaced'));
  }
  
  getDatabase() {
    return this.data;
  }
}

export const db = new LocalDB();
