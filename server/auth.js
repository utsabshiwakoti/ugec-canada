const crypto = require('crypto');
const db = require('./db');

const PROD = process.env.NODE_ENV === 'production';
let SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET === 'change-me') {
  if (PROD) { console.error('SESSION_SECRET must be set in production.'); process.exit(1); }
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] No SESSION_SECRET set; sessions reset on every restart (dev only).');
}
const COOKIE = 'ugec_sid';           // admin panel
const PARTNER_COOKIE = 'ugec_partner'; // referral partner portal (a separate sign-in)
const TTL = 1000 * 60 * 60 * 12; // admin: 12 hours
const PARTNER_TTL = 1000 * 60 * 60 * 24 * 14; // partners: 14 days

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

function setCookie(res, name, data, ttl) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttl })).toString('base64url');
  res.cookie(name, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: ttl, path: '/' });
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  const [payload, sig] = (m ? decodeURIComponent(m.slice(name.length + 1)) : '').split('.');
  if (!payload || !sig) return null;
  const expect = sign(payload);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try { const d = JSON.parse(Buffer.from(payload, 'base64url').toString()); return d.exp < Date.now() ? null : d; } catch { return null; }
}

function issue(res, uid) { setCookie(res, COOKIE, { uid }, TTL); }
function clear(res) { res.clearCookie(COOKIE, { path: '/' }); }
async function currentUser(req) {
  const d = readCookie(req, COOKIE);
  return d ? (await db.get('SELECT id, email FROM users WHERE id=?', d.uid)) || null : null;
}
async function requireAuth(req, res, next) {
  const u = await currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'ugec') return res.status(400).json({ error: 'Bad request' });
  req.user = u;
  next();
}

const pwv = (hash) => crypto.createHash('sha256').update(String(hash)).digest('base64url').slice(0, 12);
function issuePartner(res, partner) { setCookie(res, PARTNER_COOKIE, { pid: partner.id, v: pwv(partner.password_hash) }, PARTNER_TTL); }
function clearPartner(res) { res.clearCookie(PARTNER_COOKIE, { path: '/' }); }
async function currentPartner(req) {
  const d = readCookie(req, PARTNER_COOKIE);
  if (!d) return null;
  const p = await db.get("SELECT id, name, email, code, active, password_hash FROM referral_partners WHERE id=? AND portal_enabled=1 AND password_hash != ''", d.pid);
  return p && pwv(p.password_hash) === d.v ? p : null;
}

module.exports = { hashPassword, verifyPassword, issue, clear, currentUser, requireAuth, issuePartner, clearPartner, currentPartner };
