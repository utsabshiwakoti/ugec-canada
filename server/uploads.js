const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DIR = process.env.UPLOAD_DIR
  || (db.dialect === 'mysql' ? path.join(__dirname, '..', 'public', 'assets', 'uploads') : path.join(db.dataDir, 'uploads'));
const FOLDERS = ['team', 'site'];
const MAX_BYTES = 5 * 1024 * 1024;

function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function save(folder, buf) {
  if (!FOLDERS.includes(folder)) throw new Error('Unknown upload folder.');
  if (!Buffer.isBuffer(buf) || !buf.length) throw new Error('No image received.');
  if (buf.length > MAX_BYTES) throw new Error('Image is too large (5 MB max).');
  const ext = imageType(buf);
  if (!ext) throw new Error('Please upload a JPG, PNG or WebP image.');
  const name = `${crypto.randomBytes(9).toString('hex')}.${ext}`;
  fs.mkdirSync(path.join(DIR, folder), { recursive: true });
  fs.writeFileSync(path.join(DIR, folder, name), buf);
  return `/uploads/${folder}/${name}`;
}

function remove(url) {
  const m = /^\/uploads\/([a-z]+)\/([a-f0-9]+\.(?:jpg|png|webp))$/.exec(String(url || ''));
  if (!m || !FOLDERS.includes(m[1])) return;
  fs.rm(path.join(DIR, m[1], m[2]), { force: true }, () => {});
}

module.exports = { DIR, MAX_BYTES, save, remove };
