const crypto = require('crypto');
const db = require('./db');

const PROD = process.env.NODE_ENV === 'production';
let SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET === 'change-me') {
  if (PROD) { console.error('SESSION_SECRET must be set in production.'); process.exit(1); }
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] No SESSION_SECRET set; sessions reset on every restart (dev only).');
}
const COOKIE = 'ugec_sid';
const TTL = 1000 * 60 * 60 * 12; // 12 hours

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [s, h] = String(stored).split(':');
  if (!s || !h) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(h, 'hex'));
}
const sign = (p) => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');

function issue(res, uid) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + TTL })).toString('base64url');
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: TTL, path: '/',
  });
}
function clear(res) { res.clearCookie(COOKIE, { path: '/' }); }

function readCookie(req) {
  const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : '';
}
function currentUser(req) {
  const [payload, sig] = readCookie(req).split('.');
  if (!payload || !sig) return null;
  const expect = sign(payload);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (exp < Date.now()) return null;
    return db.prepare('SELECT id, email FROM users WHERE id=?').get(uid) || null;
  } catch { return null; }
}
function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'ugec') return res.status(400).json({ error: 'Bad request' });
  req.user = u;
  next();
}

module.exports = { hashPassword, verifyPassword, issue, clear, currentUser, requireAuth };
