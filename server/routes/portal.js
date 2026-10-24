const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const auth = require('../auth');
const content = require('../content');
const mailer = require('../mailer');
const { asyncRoutes } = require('../async');

const router = asyncRoutes(express.Router());
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;
const limit = (windowMin, max, error) => rateLimit({ windowMs: windowMin * 60 * 1000, limit: max, standardHeaders: true, legacyHeaders: false, message: { error } });

router.use((req, res, next) => {
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'ugec') return res.status(400).json({ error: 'Bad request' });
  res.set('Cache-Control', 'no-store');
  next();
});

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
async function newResetCode(partnerId, hours) {
  const code = crypto.randomBytes(32).toString('base64url');
  await db.run('UPDATE referral_partners SET reset_hash=?, reset_expires=? WHERE id=?', hashCode(code), Date.now() + hours * 3600 * 1000, partnerId);
  return code;
}
async function partnerForCode(code) {
  if (!code || String(code).length < 30) return null;
  return (await db.get('SELECT id, name, email, password_hash FROM referral_partners WHERE reset_hash=? AND reset_expires>? AND portal_enabled=1', hashCode(code), Date.now())) || null;
}
const siteBase = (req) => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const setPasswordLink = (req, code) => `${siteBase(req)}/referral-portal/set-password/${code}`;

router.post('/login', limit(15, 10, 'Too many sign-in attempts. Try again in a few minutes.'), async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase(), password = String((req.body || {}).password || '');
  const p = await db.get("SELECT * FROM referral_partners WHERE lower(email)=? AND portal_enabled=1 AND password_hash != ''", email);
  if (!p || !auth.verifyPassword(password, p.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  auth.issuePartner(res, p);
  await db.run('UPDATE referral_partners SET last_login=? WHERE id=?', db.now(), p.id);
  res.json({ ok: true });
});
router.post('/logout', (req, res) => { auth.clearPartner(res); res.json({ ok: true }); });

router.get('/me', async (req, res) => {
  const p = await auth.currentPartner(req);
  if (!p) return res.status(401).json({ error: 'Not signed in' });
  res.json(await content.portal(p.id));
});

router.post('/password', async (req, res) => {
  const p = await auth.currentPartner(req);
  if (!p) return res.status(401).json({ error: 'Not signed in' });
  const { current = '', next = '' } = req.body || {};
  if (!auth.verifyPassword(String(current), p.password_hash)) return res.status(400).json({ error: 'Your current password is incorrect.' });
  if (String(next).length < MIN_PASSWORD) return res.status(400).json({ error: `The new password must be at least ${MIN_PASSWORD} characters.` });
  const hash = auth.hashPassword(String(next));
  await db.run('UPDATE referral_partners SET password_hash=? WHERE id=?', hash, p.id);
  auth.issuePartner(res, { id: p.id, password_hash: hash }); // stay signed in here; other devices are signed out
  res.json({ ok: true });
});

router.post('/forgot', limit(60, 5, 'Too many requests. Please try again later or contact UGEC Canada.'), async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!mailer.enabled()) return res.json({ ok: true, emailEnabled: false });
  const p = await db.get('SELECT id, name, email FROM referral_partners WHERE lower(email)=? AND portal_enabled=1', email);
  if (p) mailer.sendPartnerLink({ to: p.email, name: p.name, link: setPasswordLink(req, await newResetCode(p.id, 1)), kind: 'reset' }).catch((e) => console.error('[mail]', e.message));
  res.json({ ok: true, emailEnabled: true });
});

router.get('/set-password/:code', async (req, res) => {
  const p = await partnerForCode(req.params.code);
  if (!p) return res.status(404).json({ error: 'This link has expired or was already used.' });
  res.json(content.resetInfo(p));
});

router.post('/set-password', limit(15, 20, 'Too many attempts. Try again in a few minutes.'), async (req, res) => {
  const { code = '', password = '' } = req.body || {};
  const p = await partnerForCode(code);
  if (!p) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one.' });
  if (String(password).length < MIN_PASSWORD) return res.status(400).json({ error: `Your password must be at least ${MIN_PASSWORD} characters.` });
  const hash = auth.hashPassword(String(password));
  await db.run("UPDATE referral_partners SET password_hash=?, reset_hash='', reset_expires=0, last_login=? WHERE id=?", hash, db.now(), p.id);
  auth.issuePartner(res, { id: p.id, password_hash: hash }); // signed in straight away
  res.json({ ok: true });
});

module.exports = { router, newResetCode, setPasswordLink, partnerForCode };
