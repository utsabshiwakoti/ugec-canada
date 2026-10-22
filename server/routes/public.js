const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const content = require('../content');
const { notifyLead, confirmLead, sendPortalLink, enabled: mailEnabled } = require('../mailer');

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const short = (res) => res.set('Cache-Control', 'public, max-age=60');

router.get('/site', (req, res) => res.set('Cache-Control', 'no-cache').json(content.site()));

router.get('/referrers/:code', (req, res) => {
  const r = db.prepare('SELECT code, name FROM referral_partners WHERE code=? AND active=1').get(String(req.params.code).toUpperCase().slice(0, 16));
  if (!r) return res.status(404).json({ error: 'Unknown code' });
  res.set('Cache-Control', 'no-cache').json(r);
});

router.get('/programs', (req, res) => short(res).json(content.programs()));
router.get('/programs/:slug', (req, res) => {
  const r = content.programBySlug(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Not found' });
  short(res).json(r);
});
router.get('/posts', (req, res) => short(res).json(content.posts()));
router.get('/posts/:slug', (req, res) => {
  const r = content.postBySlug(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Not found' });
  short(res).json(r);
});

const portalLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Try again in a minute.' } });
router.get('/portal/:token', portalLimiter, (req, res) => {
  const d = content.portal(req.params.token);
  res.set('Cache-Control', 'no-store');
  if (!d) return res.status(404).json({ error: 'This link is not valid. Ask UGEC Canada for your current link.' });
  res.json(d);
});
const linkLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please try again later or contact UGEC Canada.' } });
router.post('/portal/request', linkLimiter, (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!mailEnabled()) return res.json({ ok: true, emailEnabled: false });
  const base = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  for (const p of db.prepare("SELECT name, email, portal_token FROM referral_partners WHERE lower(email)=? AND active=1 AND portal_token != ''").all(email)) {
    sendPortalLink({ to: p.email, name: p.name, link: `${base}/referral-portal/${p.portal_token}` }).catch((e) => console.error('[mail]', e.message));
  }
  res.json({ ok: true, emailEnabled: true });
});

const leadLimiter =rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many submissions from this connection. Please message us on WhatsApp instead.' } });

router.post('/leads/:type', leadLimiter, (req, res) => {
  const form = db.prepare('SELECT * FROM forms WHERE type=? AND enabled=1').get(req.params.type);
  if (!form) return res.status(404).json({ error: 'This form is not available.' });
  if (req.body && req.body.hp) return res.json({ ok: true }); // honeypot: bots fill hidden fields
  const fields = parse(form.fields, []);
  const input = (req.body && req.body.values) || {};
  const clean = {}; const errors = [];
  for (const f of fields) {
    const v = String(input[f.n] ?? '').trim().slice(0, 2000);
    if (f.r && !v) errors.push(`${f.l} is required.`);
    else if (v && f.t === 'email' && !EMAIL.test(v)) errors.push(`${f.l} must be a valid email address.`);
    if (v) clean[f.n] = v;
  }
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  let partner = null, method = '', other = '';
  if (form.type !== 'partner') {
    const ref = (req.body && req.body.referral) || {};
    const code = String(ref.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    if (code) partner = db.prepare('SELECT id, name, code FROM referral_partners WHERE code=? AND active=1').get(code) || null;
    if (partner) method = ['link', 'selected', 'typed'].includes(ref.via) ? ref.via : 'selected';
    else if (ref.other) { other = String(ref.other).trim().slice(0, 200); method = 'typed'; }
  }
  const row = {
    form_type: form.type, referral_partner_id: partner ? partner.id : null, referral_method: method, referral_other: other,
    name: clean.name || clean.contact || clean.institution || '',
    email: clean.email || '', phone: clean.phone || '',
    program: clean.interest || clean.programs || '', data: JSON.stringify(clean),
  };
  const info = db.prepare('INSERT INTO leads(form_type,name,email,phone,program,data,referral_partner_id,referral_method,referral_other) VALUES(@form_type,@name,@email,@phone,@program,@data,@referral_partner_id,@referral_method,@referral_other)').run(row);
  const settings = db.getSettings();
  const to = form.notify_email || process.env.NOTIFY_EMAIL || settings.contact_email;
  notifyLead({ to, title: form.title, replyTo: row.email, lines: [`Form: ${form.title}`, ...(partner ? [`Referred by: ${partner.name} (${partner.code}, ${method})`] : other ? [`Referred by (typed): ${other}`] : []), ...fields.filter((f) => clean[f.n]).map((f) => `${f.l}: ${clean[f.n]}`)] })
    .catch((e) => console.error('[mail]', e.message));
  if (row.email && settings.confirm_email !== '0') {
    confirmLead({ to: row.email, name: row.name, title: form.title, settings }).catch((e) => console.error('[mail]', e.message));
  }
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

module.exports = router;
