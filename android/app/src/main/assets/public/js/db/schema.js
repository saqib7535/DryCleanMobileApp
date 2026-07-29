/* ============================================================
   SQLite schema for DryClean POS.
   SCHEMA_VERSION drives a simple migration runner in db.js —
   bump it and add a branch in runMigrations() when the shape
   of the tables needs to change after the app has shipped.
   ============================================================ */

const SCHEMA_VERSION = 1;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'admin',
     last_login TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY,
     value TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS customers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     phone TEXT,
     whatsapp TEXT,
     address TEXT,
     notes TEXT,
     photo_path TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS categories (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     icon TEXT NOT NULL DEFAULT 'shirt',
     color TEXT NOT NULL DEFAULT '#2563eb',
     default_price REAL NOT NULL DEFAULT 0,
     enabled INTEGER NOT NULL DEFAULT 1,
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS services (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     price REAL NOT NULL DEFAULT 0,
     enabled INTEGER NOT NULL DEFAULT 1,
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS orders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     tracking_no TEXT UNIQUE NOT NULL,
     customer_id INTEGER NOT NULL REFERENCES customers(id),
     order_date TEXT NOT NULL,
     return_date TEXT,
     urgent INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'Pending',
     subtotal REAL NOT NULL DEFAULT 0,
     discount REAL NOT NULL DEFAULT 0,
     extra_charges REAL NOT NULL DEFAULT 0,
     delivery_charges REAL NOT NULL DEFAULT 0,
     grand_total REAL NOT NULL DEFAULT 0,
     advance_paid REAL NOT NULL DEFAULT 0,
     remaining_balance REAL NOT NULL DEFAULT 0,
     payment_method TEXT,
     notes TEXT,
     delivered_at TEXT,
     delivered_by TEXT,
     signature_data TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS order_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     category_id INTEGER REFERENCES categories(id),
     service_id INTEGER REFERENCES services(id),
     category_name TEXT,
     service_name TEXT,
     quantity REAL NOT NULL DEFAULT 1,
     rate REAL NOT NULL DEFAULT 0,
     subtotal REAL NOT NULL DEFAULT 0,
     photo_path TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS payments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     amount REAL NOT NULL,
     method TEXT NOT NULL DEFAULT 'Cash',
     note TEXT,
     paid_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS order_status_history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     changed_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS backups (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     file_name TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     size INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS expenses (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     expense_date TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'Other',
     description TEXT,
     amount REAL NOT NULL DEFAULT 0,
     payment_method TEXT NOT NULL DEFAULT 'Cash',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_no)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`,
  `CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)`
];

const DEFAULT_EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Transport', 'Other'];

const DEFAULT_CATEGORIES = [
  { name: 'Shalwar Kameez', icon: 'shirt', color: '#2563eb', price: 100 },
  { name: 'Pant', icon: 'pants', color: '#0891b2', price: 80 },
  { name: 'Coat', icon: 'coat', color: '#7c3aed', price: 250 },
  { name: 'Suit', icon: 'suit', color: '#6d28d9', price: 400 },
  { name: 'Blanket', icon: 'blanket', color: '#d97706', price: 300 },
  { name: 'Curtain', icon: 'curtain', color: '#16a34a', price: 200 },
  { name: 'Bedsheet', icon: 'bedsheet', color: '#0d9488', price: 150 },
  { name: 'Comforter', icon: 'comforter', color: '#dc2626', price: 350 },
  { name: 'Carpet', icon: 'carpet', color: '#b45309', price: 500 },
  { name: 'Sofa Cover', icon: 'sofa', color: '#475569', price: 300 },
  { name: 'Pillow Cover', icon: 'pillow', color: '#0ea5e9', price: 50 },
  { name: 'School Uniform', icon: 'uniform', color: '#2563eb', price: 100 },
  { name: 'Jacket', icon: 'jacket', color: '#334155', price: 200 },
  { name: 'Waistcoat', icon: 'waistcoat', color: '#78350f', price: 120 },
  { name: 'Shoes', icon: 'shoes', color: '#57534e', price: 150 },
  { name: 'Others', icon: 'others', color: '#64748b', price: 100 }
];

const DEFAULT_SERVICES = [
  { name: 'Only Washing', price: 80 },
  { name: 'Wash + Iron', price: 120 },
  { name: 'Only Iron', price: 50 },
  { name: 'Dry Clean', price: 200 },
  { name: 'Steam Press', price: 90 }
];

const DEFAULT_SETTINGS = {
  shop_name: 'Soothmedia Dry Cleaners',
  shop_address: '',
  shop_phone: '',
  shop_whatsapp: '',
  currency_symbol: 'Rs.',
  country_code: '92',
  language: 'en',
  theme: 'light',
  auto_backup: '1',
  auto_logout_minutes: '0',
  db_encryption: '1'
};
