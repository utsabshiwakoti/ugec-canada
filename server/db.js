const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ugec.db');
fs.mkdirSync(path.dirname(file), { recursive: true });

const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
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
  sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, form_type TEXT NOT NULL, name TEXT DEFAULT '',
  email TEXT DEFAULT '', phone TEXT DEFAULT '', program TEXT DEFAULT '', data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new', notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
`);

function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((r) => r.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('programs', 'audience', "TEXT NOT NULL DEFAULT 'both'");
addColumn('leads', 'referral_partner_id', 'INTEGER REFERENCES referral_partners(id)');
addColumn('leads', 'referral_method', "TEXT NOT NULL DEFAULT ''");
addColumn('leads', 'referral_other', "TEXT NOT NULL DEFAULT ''");
addColumn('leads', 'commission_status', "TEXT NOT NULL DEFAULT 'none'");
addColumn('leads', 'commission_amount', 'REAL NOT NULL DEFAULT 0');
db.exec('CREATE INDEX IF NOT EXISTS idx_leads_partner ON leads(referral_partner_id)');
addColumn('users', 'last_login', "TEXT NOT NULL DEFAULT ''");
db.exec(`CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_email TEXT NOT NULL DEFAULT '', action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
addColumn('referral_partners', 'portal_token', "TEXT NOT NULL DEFAULT ''");
for (const p of db.prepare("SELECT id FROM referral_partners WHERE portal_token=''").all()) {
  db.prepare('UPDATE referral_partners SET portal_token=? WHERE id=?').run(require('crypto').randomBytes(24).toString('base64url'), p.id);
}
db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('confirm_email','1')").run();

function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value ?? ''));
}

module.exports = db;
module.exports.getSettings = getSettings;
module.exports.setSetting = setSetting;
module.exports.dataDir = path.dirname(file);
