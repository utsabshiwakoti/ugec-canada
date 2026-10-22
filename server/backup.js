const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('./db');
const uploads = require('./uploads');

const DIR = process.env.BACKUP_DIR || path.join(db.dataDir, 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 14);
const NAME = /^ugec-\d{4}-\d{2}-\d{2}\.db$/;

function copyNew(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) n += copyNew(s, d);
    else if (!fs.existsSync(d)) { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(s, d); n++; }
  }
  return n;
}

async function run() {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `ugec-${new Date().toISOString().slice(0, 10)}.db`);
  const made = !fs.existsSync(file);
  if (made) await db.backup(file);
  const photos = copyNew(uploads.DIR, path.join(DIR, 'uploads'));
  for (const f of fs.readdirSync(DIR).filter((x) => NAME.test(x)).sort().slice(0, -KEEP)) fs.rmSync(path.join(DIR, f), { force: true });
  return { file: path.basename(file), made, photos };
}

function schedule() {
  const go = () => run().then((r) => r.made && console.log(`[backup] saved ${r.file}`)).catch((e) => console.error('[backup]', e.message));
  setTimeout(go, 60 * 1000).unref();
  setInterval(go, 6 * 60 * 60 * 1000).unref();
}

function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => NAME.test(f)).sort().reverse()
    .map((f) => ({ name: f, size: fs.statSync(path.join(DIR, f)).size }));
}

async function snapshot() {
  const file = path.join(os.tmpdir(), `ugec-download-${process.pid}-${Date.now()}.db`);
  await db.backup(file);
  return file;
}

module.exports = { DIR, KEEP, run, schedule, list, snapshot };
