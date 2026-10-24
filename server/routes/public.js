const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const content = require('../content');
const { asyncRoutes } = require('../async');
const { notifyLead, confirmLead } = require('../mailer');

const router = asyncRoutes(express.Router());
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const short = (res) => res.set('Cache-Control', 'public, max-age=60');

router.get('/site', async (req, res) => res.set('Cache-Control', 'no-cache').json(await content.site()));

router.get('/referrers/:code', async (req, res) => {
  const r = await db.get('SELECT code, name FROM referral_partners WHERE code=? AND active=1', String(req.params.code).toUpperCase().slice(0, 16));
  if (!r) return res.status(404).json({ error: 'Unknown code' });
  res.set('Cache-Control', 'no-cache').json(r);
});

router.get('/programs', async (req, res) => short(res).json(await content.programs()));
router.get('/programs/:slug', async (req, res) => {
  const r = await content.programBySlug(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Not found' });
  short(res).json(r);
});
router.get('/posts', async (req, res) => short(res).json(await content.posts()));
router.get('/posts/:slug', async (req, res) => {
  const r = await content.postBySlug(req.params.slug);
  if (!r) return res.status(404).json({ error: 'Not found' });
  short(res).json(r);
});

const leadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many submissions from this connection. Please message us on WhatsApp instead.' } });

router.post('/leads/:type', leadLimiter, async (req, res) => {
  const form = await db.get('SELECT * FROM forms WHERE type=? AND enabled=1', req.params.type);
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
    if (code) partner = (await db.get('SELECT id, name, code FROM referral_partners WHERE code=? AND active=1', code)) || null;
    if (partner) method = ['link', 'selected', 'typed'].includes(ref.via) ? ref.via : 'selected';
    else if (ref.other) { other = String(ref.other).trim().slice(0, 200); method = 'typed'; }
  }
  const row = {
    form_type: form.type, referral_partner_id: partner ? partner.id : null, referral_method: method, referral_other: other,
    name: clean.name || clean.contact || clean.institution || '',
    email: clean.email || '', phone: clean.phone || '',
    program: clean.interest || clean.programs || '', data: JSON.stringify(clean),
  };
  const info = await db.run('INSERT INTO leads(form_type, name, email, phone, program, data, referral_partner_id, referral_method, referral_other, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    row.form_type, row.name, row.email, row.phone, row.program, row.data, row.referral_partner_id, row.referral_method, row.referral_other, db.now());
  const settings = await db.getSettings();
  const to = form.notify_email || process.env.NOTIFY_EMAIL || settings.contact_email;
  const digits = row.phone.replace(/\D/g, '').slice(-10);
  const before = await db.all("SELECT id, created_at FROM leads WHERE id <> ? AND ((? <> '' AND lower(email) = lower(?)) OR (? <> '' AND phone LIKE ?)) ORDER BY id DESC LIMIT 3",
    info.id, row.email, row.email, digits.length >= 7 ? digits : '', `%${digits.slice(-7)}%`);
  const repeat = before.length ? [`Note: this person contacted UGEC before (lead${before.length > 1 ? 's' : ''} ${before.map((b) => `#${b.id} on ${b.created_at.slice(0, 10)}`).join(', ')}).`] : [];
  notifyLead({ to, title: form.title, replyTo: row.email, lines: [`Form: ${form.title}`, ...repeat, ...(partner ? [`Referred by: ${partner.name} (${partner.code}, ${method})`] : other ? [`Referred by (typed): ${other}`] : []), ...fields.filter((f) => clean[f.n]).map((f) => `${f.l}: ${clean[f.n]}`)] })
    .catch((e) => console.error('[mail]', e.message));
  if (row.email && settings.confirm_email !== '0') {
    confirmLead({ to: row.email, name: row.name, title: form.title, settings }).catch((e) => console.error('[mail]', e.message));
  }
  res.status(201).json({ ok: true, id: info.id });
});

module.exports = router;
