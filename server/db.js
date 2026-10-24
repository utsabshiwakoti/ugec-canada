const path = require('path');
const fs = require('fs');

const MYSQL = !!process.env.DB_HOST;
const sqliteFile = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ugec.db');

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, website TEXT DEFAULT '',
  province TEXT DEFAULT '', notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '', province TEXT NOT NULL DEFAULT '', campus TEXT DEFAULT '',
  provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
  duration TEXT DEFAULT '', delivery TEXT DEFAULT '', intake TEXT DEFAULT '', fees TEXT DEFAULT '',
  admission TEXT DEFAULT '', english TEXT DEFAULT '', placement TEXT DEFAULT '', credential TEXT DEFAULT '',
  career TEXT DEFAULT '', suitable TEXT DEFAULT '', pathways TEXT DEFAULT '', guarantee TEXT DEFAULT '',
  notes TEXT DEFAULT '', coming_soon INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')), audience TEXT NOT NULL DEFAULT 'both');
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
  category TEXT DEFAULT '', summary TEXT DEFAULT '', body TEXT DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1, published_at TEXT NOT NULL DEFAULT (date('now')));
CREATE TABLE IF NOT EXISTS team (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '',
  photo TEXT DEFAULT '', sort INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS forms (
  type TEXT PRIMARY KEY, title TEXT NOT NULL, fields TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1, notify_email TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS referral_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
  email TEXT DEFAULT '', phone TEXT DEFAULT '', commission_terms TEXT DEFAULT '', notes TEXT DEFAULT '',
  listed INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  password_hash TEXT NOT NULL DEFAULT '', portal_enabled INTEGER NOT NULL DEFAULT 1, last_login TEXT NOT NULL DEFAULT '',
  reset_hash TEXT NOT NULL DEFAULT '', reset_expires INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, form_type TEXT NOT NULL, name TEXT DEFAULT '',
  email TEXT DEFAULT '', phone TEXT DEFAULT '', program TEXT DEFAULT '', data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new', notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  referral_partner_id INTEGER REFERENCES referral_partners(id), referral_method TEXT NOT NULL DEFAULT '',
  referral_other TEXT NOT NULL DEFAULT '', commission_status TEXT NOT NULL DEFAULT 'none', commission_amount REAL NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_partner ON leads(referral_partner_id);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_email TEXT NOT NULL DEFAULT '', action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL, user_email TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'note', text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_events_lead ON lead_events(lead_id);
`;

const MYSQL_TABLES = [
  `settings (\`key\` VARCHAR(100) PRIMARY KEY, value MEDIUMTEXT)`,
  `users (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(191) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login VARCHAR(19) NOT NULL DEFAULT '')`,
  `providers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, website VARCHAR(500) NOT NULL DEFAULT '',
    province VARCHAR(100) NOT NULL DEFAULT '', notes TEXT)`,
  `programs (id INT AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(191) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT '', province VARCHAR(100) NOT NULL DEFAULT '', campus VARCHAR(255) NOT NULL DEFAULT '',
    provider_id INT NULL, duration TEXT, delivery TEXT, intake TEXT, fees TEXT, admission TEXT, english TEXT, placement TEXT,
    credential TEXT, career TEXT, suitable TEXT, pathways TEXT, guarantee TEXT, notes TEXT,
    coming_soon TINYINT NOT NULL DEFAULT 0, published TINYINT NOT NULL DEFAULT 1, sort INT NOT NULL DEFAULT 0,
    updated_at VARCHAR(19) NOT NULL DEFAULT '', audience VARCHAR(20) NOT NULL DEFAULT 'both',
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL)`,
  `posts (id INT AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(191) NOT NULL UNIQUE, title VARCHAR(500) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT '', summary TEXT, body MEDIUMTEXT, published TINYINT NOT NULL DEFAULT 1, published_at DATE NOT NULL)`,
  `team (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, role VARCHAR(255) NOT NULL DEFAULT '',
    photo VARCHAR(1000) NOT NULL DEFAULT '', sort INT NOT NULL DEFAULT 0, visible TINYINT NOT NULL DEFAULT 1)`,
  `forms (type VARCHAR(100) PRIMARY KEY, title VARCHAR(255) NOT NULL, fields MEDIUMTEXT,
    enabled TINYINT NOT NULL DEFAULT 1, notify_email VARCHAR(255) NOT NULL DEFAULT '')`,
  `referral_partners (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL UNIQUE,
    email VARCHAR(191) NOT NULL DEFAULT '', phone VARCHAR(100) NOT NULL DEFAULT '', commission_terms TEXT, notes TEXT,
    listed TINYINT NOT NULL DEFAULT 1, active TINYINT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    password_hash VARCHAR(255) NOT NULL DEFAULT '', portal_enabled TINYINT NOT NULL DEFAULT 1, last_login VARCHAR(19) NOT NULL DEFAULT '',
    reset_hash VARCHAR(64) NOT NULL DEFAULT '', reset_expires BIGINT NOT NULL DEFAULT 0)`,
  `leads (id INT AUTO_INCREMENT PRIMARY KEY, form_type VARCHAR(100) NOT NULL, name TEXT, email TEXT, phone TEXT, program TEXT,
    data MEDIUMTEXT, status VARCHAR(50) NOT NULL DEFAULT 'new', notes TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    referral_partner_id INT NULL, referral_method VARCHAR(20) NOT NULL DEFAULT '', referral_other VARCHAR(255) NOT NULL DEFAULT '',
    commission_status VARCHAR(20) NOT NULL DEFAULT 'none', commission_amount DOUBLE NOT NULL DEFAULT 0,
    INDEX idx_leads_created (created_at), INDEX idx_leads_partner (referral_partner_id),
    FOREIGN KEY (referral_partner_id) REFERENCES referral_partners(id))`,
  `activity (id INT AUTO_INCREMENT PRIMARY KEY, user_email VARCHAR(255) NOT NULL DEFAULT '', action VARCHAR(300) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `lead_events (id INT AUTO_INCREMENT PRIMARY KEY, lead_id INT NOT NULL, user_email VARCHAR(255) NOT NULL DEFAULT '',
    kind VARCHAR(20) NOT NULL DEFAULT 'note', text TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_events_lead (lead_id))`,
];
const TABLES = ['settings', 'users', 'providers', 'programs', 'posts', 'team', 'forms', 'referral_partners', 'leads', 'lead_events', 'activity'];

const NEW_COLUMNS = [
  ['users', 'name', "TEXT NOT NULL DEFAULT ''", "VARCHAR(255) NOT NULL DEFAULT ''"],
  ['users', 'role', "TEXT NOT NULL DEFAULT 'admin'", "VARCHAR(20) NOT NULL DEFAULT 'admin'"],
  ['users', 'totp_secret', "TEXT NOT NULL DEFAULT ''", "VARCHAR(64) NOT NULL DEFAULT ''"],
  ['users', 'totp_on', 'INTEGER NOT NULL DEFAULT 0', 'TINYINT NOT NULL DEFAULT 0'],
  ['users', 'totp_last', 'INTEGER NOT NULL DEFAULT 0', 'BIGINT NOT NULL DEFAULT 0'],
  ['users', 'digest', 'INTEGER NOT NULL DEFAULT 1', 'TINYINT NOT NULL DEFAULT 1'],
  ['leads', 'assigned_to', 'INTEGER', 'INT NULL'],
  ['leads', 'follow_up', "TEXT NOT NULL DEFAULT ''", "VARCHAR(10) NOT NULL DEFAULT ''"],
  ['leads', 'paid', 'INTEGER NOT NULL DEFAULT 0', 'TINYINT NOT NULL DEFAULT 0'],
];

function mysqlDriver() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    connectionLimit: 5, charset: 'utf8mb4', dateStrings: true, decimalNumbers: true, timezone: 'Z',
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : undefined,
    typeCast(field, next) {
      if (['BLOB', 'TINY_BLOB', 'MEDIUM_BLOB', 'LONG_BLOB'].includes(field.type)) { const v = field.string(); return v === null ? '' : v; }
      return next();
    },
  });
  pool.pool.on('connection', (c) => c.query("SET time_zone = '+00:00'")); // so CURRENT_TIMESTAMP is UTC
  return {
    dialect: 'mysql',
    all: async (sql, p) => (await pool.query(sql, p))[0],
    run: async (sql, p) => { const [r] = await pool.query(sql, p); return { id: r.insertId, changes: r.affectedRows }; },
    async init() {
      for (const t of MYSQL_TABLES) await pool.query(`CREATE TABLE IF NOT EXISTS ${t} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      for (const [t, c, , d] of NEW_COLUMNS) await this.addColumn(t, c, d);
    },
    async addColumn(table, col, def) {
      const [rows] = await pool.query('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [table, col]);
      if (!rows.length) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    },
    close: () => pool.end(),
  };
}

function sqliteDriver() {
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });
  const s = new Database(sqliteFile);
  s.pragma('journal_mode = WAL');
  s.pragma('foreign_keys = ON');
  const addColumn = async (table, col, def) => {
    if (!s.prepare(`PRAGMA table_info(${table})`).all().some((r) => r.name === col)) s.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  return {
    dialect: 'sqlite',
    all: async (sql, p) => s.prepare(sql).all(...p),
    run: async (sql, p) => { const r = s.prepare(sql).run(...p); return { id: Number(r.lastInsertRowid), changes: r.changes }; },
    async init() {
      s.exec(SQLITE_SCHEMA);
      for (const [t, c, d] of [
        ['programs', 'audience', "TEXT NOT NULL DEFAULT 'both'"], ['leads', 'referral_partner_id', 'INTEGER REFERENCES referral_partners(id)'],
        ['leads', 'referral_method', "TEXT NOT NULL DEFAULT ''"], ['leads', 'referral_other', "TEXT NOT NULL DEFAULT ''"],
        ['leads', 'commission_status', "TEXT NOT NULL DEFAULT 'none'"], ['leads', 'commission_amount', 'REAL NOT NULL DEFAULT 0'],
        ['users', 'last_login', "TEXT NOT NULL DEFAULT ''"], ['referral_partners', 'password_hash', "TEXT NOT NULL DEFAULT ''"],
        ['referral_partners', 'portal_enabled', 'INTEGER NOT NULL DEFAULT 1'], ['referral_partners', 'last_login', "TEXT NOT NULL DEFAULT ''"],
        ['referral_partners', 'reset_hash', "TEXT NOT NULL DEFAULT ''"], ['referral_partners', 'reset_expires', 'INTEGER NOT NULL DEFAULT 0'],
      ]) await addColumn(t, c, d);
      for (const [t, c, d] of NEW_COLUMNS) await addColumn(t, c, d);
    },
    addColumn,
    backupTo: (file) => s.backup(file), // a complete copy of the database file
    close: async () => s.close(),
  };
}

const driver = MYSQL ? mysqlDriver() : sqliteDriver();

const fix = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

const db = {
  dialect: driver.dialect,
  dataDir: path.dirname(sqliteFile),
  all: (sql, ...p) => driver.all(sql, fix(p)),
  get: async (sql, ...p) => (await driver.all(sql, fix(p)))[0],
  run: (sql, ...p) => driver.run(sql, fix(p)),
  now: () => new Date().toISOString().replace('T', ' ').slice(0, 19),
  today: () => new Date().toISOString().slice(0, 10),
  insertIgnore: driver.dialect === 'mysql' ? 'INSERT IGNORE' : 'INSERT OR IGNORE',
  tables: TABLES,
  addColumn: driver.addColumn,
  backupTo: driver.backupTo,
  close: driver.close,

  async init() {
    await driver.init();
    await db.run(`${db.insertIgnore} INTO settings(\`key\`, value) VALUES('confirm_email', '1')`); // starts switched on
  },
  async getSettings() {
    const out = {};
    for (const r of await db.all('SELECT `key`, value FROM settings')) out[r.key] = r.value ?? '';
    return out;
  },
  setSetting(key, value) {
    const sql = driver.dialect === 'mysql'
      ? 'INSERT INTO settings(`key`, value) VALUES(?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)'
      : 'INSERT INTO settings(`key`, value) VALUES(?, ?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value';
    return db.run(sql, key, String(value ?? ''));
  },
};

module.exports = db;
