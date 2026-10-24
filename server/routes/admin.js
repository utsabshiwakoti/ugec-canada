const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const auth = require('../auth');
const resources = require('../resources');
const uploads = require('../uploads');
const backup = require('../backup');
const mailer = require('../mailer');
const portal = require('./portal');
const { asyncRoutes } = require('../async');
const fs = require('fs');

const router = asyncRoutes(express.Router());
const settingsFields = resources.settingsFields;
const LEAD_STATUSES = ['new', 'contacted', 'consultation booked', 'applied', 'enrolled', 'closed'];
const COMMISSION_STATUSES = ['none', 'pending', 'approved', 'paid', 'void'];

async function logActivity(email, action) {
  const r = await db.run('INSERT INTO activity(user_email, action, created_at) VALUES(?,?,?)', String(email || ''), String(action).slice(0, 300), db.now());
  await db.run('DELETE FROM activity WHERE id <= ?', r.id - 5000); // keep the latest 5000
}
const log = (email, action) => logActivity(email, action).catch((e) => console.error('[activity]', e.message));
const VERB = { POST: 'added', PUT: 'updated', PATCH: 'updated', DELETE: 'deleted' };
function describe(req) {
  const [first, id] = req.path.split('/').filter(Boolean);
  if (first === 'settings') return 'updated site settings';
  if (first === 'password') return 'changed their password';
  if (first === 'leads') return `${VERB[req.method]} lead #${id}`;
  const r = resources[first];
  if (r && first !== 'settingsFields') {
    const label = (req.body && (req.body.name || req.body.title)) || (id ? '#' + id : '');
    return `${VERB[req.method]} ${r.label.toLowerCase()}${label ? ` "${label}"` : ''}`;
  }
  return `${req.method} ${req.path}`;
}

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'item';

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' } });

router.post('/login', loginLimiter, async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const u = await db.get('SELECT * FROM users WHERE email=?', String(email).toLowerCase().trim());
  if (!u || !auth.verifyPassword(String(password), u.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  auth.issue(res, u.id);
  await db.run('UPDATE users SET last_login=? WHERE id=?', db.now(), u.id);
  log(u.email, 'signed in');
  res.json({ ok: true, email: u.email });
});
router.post('/logout', (req, res) => { auth.clear(res); res.json({ ok: true }); });
router.get('/me', async (req, res) => {
  const u = await auth.currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  res.json(u);
});

router.use(auth.requireAuth);

router.use((req, res, next) => {
  if (req.method === 'GET' || req.path.startsWith('/uploads/') || req.path === '/logout') return next();
  res.on('finish', () => { if (res.statusCode < 400) log(req.user.email, res.locals.activity || describe(req)); });
  next();
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.get('/users', async (req, res) => {
  res.json({ me: req.user.id, users: await db.all('SELECT id, email, created_at, last_login FROM users ORDER BY email') });
});
router.post('/users', async (req, res) => {
  const email = String((req.body || {}).email || '').toLowerCase().trim(), password = String((req.body || {}).password || '');
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 12) return res.status(400).json({ error: 'The password must be at least 12 characters.' });
  if (await db.get('SELECT 1 FROM users WHERE email=?', email)) return res.status(400).json({ error: 'There is already a login for that email.' });
  await db.run('INSERT INTO users(email, password_hash, created_at) VALUES(?,?,?)', email, auth.hashPassword(password), db.now());
  res.locals.activity = `added admin user ${email}`;
  res.status(201).json({ ok: true });
});
router.delete('/users/:id', async (req, res) => {
  const u = await db.get('SELECT id, email FROM users WHERE id=?', req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own login. Ask another admin to do it.' });
  await db.run('DELETE FROM users WHERE id=?', u.id);
  res.locals.activity = `removed admin user ${u.email}`;
  res.json({ ok: true });
});
router.get('/activity', async (req, res) => res.json(await db.all('SELECT user_email, action, created_at FROM activity ORDER BY id DESC LIMIT 200')));

router.get('/backup', (req, res) => res.json({ mode: db.dialect, backups: backup.list(), keep: backup.KEEP }));
router.post('/backup/run', async (req, res) => {
  if (db.dialect !== 'sqlite') return res.status(400).json({ error: 'Automatic backups are only made on your own computer. Use "Download a backup now" instead.' });
  const r = await backup.run(); res.locals.activity = 'ran a backup'; res.json(r);
});
router.get('/backup/download', async (req, res) => {
  const { file, name } = await backup.snapshot();
  log(req.user.email, 'downloaded a backup');
  res.download(file, name, () => fs.rm(file, { force: true }, () => {}));
});

router.get('/email', (req, res) => res.json({ enabled: mailer.enabled(), mode: mailer.mode() }));
router.post('/email/test', async (req, res) => {
  try { await mailer.sendTest(req.user.email); res.locals.activity = 'sent a test email'; res.json({ ok: true, to: req.user.email }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/password', async (req, res) => {
  const { current = '', next = '' } = req.body || {};
  if (String(next).length < 12) return res.status(400).json({ error: 'New password must be at least 12 characters.' });
  const u = await db.get('SELECT * FROM users WHERE id=?', req.user.id);
  if (!auth.verifyPassword(String(current), u.password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
  await db.run('UPDATE users SET password_hash=? WHERE id=?', auth.hashPassword(String(next)), u.id);
  res.json({ ok: true });
});

router.get('/schema', (req, res) => {
  const out = {};
  for (const [k, r] of Object.entries(resources)) if (k !== 'settingsFields') out[k] = { label: r.label, id: r.id, idEditable: !!r.idEditable, list: r.list, fields: r.fields };
  res.json({ resources: out, settingsFields, leadStatuses: LEAD_STATUSES, commissionStatuses: COMMISSION_STATUSES });
});

router.get('/settings', async (req, res) => res.json(await db.getSettings()));
function structured(f, v) {
  let data = v;
  if (typeof v === 'string') { try { data = JSON.parse(v || (f.t === 'map' ? '{}' : '[]')); } catch { throw new Error(`${f.l.split(' (')[0]} could not be read. Reload the page and try again.`); } }
  if (f.t === 'map') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${f.l.split(' (')[0]} has an invalid value.`);
    const out = {};
    for (const [k, val] of Object.entries(data)) if (String(k).trim()) out[String(k).trim()] = String(val ?? '');
    return JSON.stringify(out, null, 2);
  }
  if (!Array.isArray(data)) throw new Error(`${f.l.split(' (')[0]} must be a list.`);
  if (f.t === 'list') {
    data = data.filter((it) => it && typeof it === 'object').map((it) => {
      const o = {};
      for (const b of f.item) {
        const x = it[b.n];
        if (b.t === 'checkbox') { if (x) o[b.n] = 1; }
        else if (b.t === 'choices') { if (Array.isArray(x)) o[b.n] = x.map(String).map((s) => s.trim()).filter(Boolean); else if (typeof x === 'string' && x) o[b.n] = x; }
        else if (x !== undefined && x !== '') o[b.n] = String(x).trim();
      }
      return o;
    }).filter((o) => Object.keys(o).length);
  }
  return JSON.stringify(data, null, 2);
}
function checkFormFields(json) {
  const list = JSON.parse(json), seen = new Set();
  list.forEach((q, i) => {
    if (!q.l) throw new Error(`Question ${i + 1} needs a label.`);
    q.n = slugify(q.n || q.l).replace(/-/g, '_').slice(0, 40);
    if (seen.has(q.n)) throw new Error(`Two questions are saved as "${q.n}". Give one of them a different internal name.`);
    seen.add(q.n);
    if (q.t === 'select' && !(q.o && q.o.length)) throw new Error(`"${q.l}" is a dropdown list, so it needs some choices.`);
    if (q.t !== 'select') delete q.o;
  });
  return JSON.stringify(list, null, 2);
}

const validImage = (v) => !v || /^\/uploads\/[a-z]+\/[a-f0-9]+\.(jpg|png|webp)$/.test(v) || /^https:\/\/\S+$/.test(v);

router.put('/settings', async (req, res) => {
  const body = req.body || {}, before = await db.getSettings(), changes = [];
  for (const f of settingsFields) {
    if (!(f.n in body)) continue;
    let v = body[f.n];
    if (f.t === 'checkbox') v = v ? '1' : '0';
    if (f.t === 'json' || f.t === 'list' || f.t === 'map') {
      try { v = structured(f, v); } catch (e) { return res.status(400).json({ error: e.message }); }
    }
    if (f.t === 'range') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < f.min || n > f.max) return res.status(400).json({ error: `${f.l} must be between ${f.min} and ${f.max}.` });
      v = String(Math.round(n));
    }
    if (f.t === 'image') { v = String(v ?? '').trim(); if (!validImage(v)) return res.status(400).json({ error: `${f.l.split(' (')[0]} is not a valid image.` }); }
    changes.push([f, v]);
  }
  for (const [f, v] of changes) {
    await db.setSetting(f.n, v);
    if (f.t === 'image' && before[f.n] !== v) uploads.remove(before[f.n]); // replaced or removed
  }
  res.json(await db.getSettings());
});

const LEAD_SELECT = `SELECT l.*, p.name AS partner_name, p.code AS partner_code FROM leads l LEFT JOIN referral_partners p ON p.id = l.referral_partner_id`;
function leadQuery(q) {
  const where = []; const args = [];
  if (q.status && q.status !== 'all') { where.push('l.status=?'); args.push(q.status); }
  if (q.form && q.form !== 'all') { where.push('l.form_type=?'); args.push(q.form); }
  if (q.partner === 'none') where.push('l.referral_partner_id IS NULL');
  else if (q.partner === 'any') where.push('l.referral_partner_id IS NOT NULL');
  else if (q.partner && q.partner !== 'all') { where.push('l.referral_partner_id=?'); args.push(Number(q.partner) || 0); }
  if (q.q) { where.push('(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.program LIKE ? OR l.data LIKE ? OR p.name LIKE ? OR l.referral_other LIKE ?)'); const l = `%${q.q}%`; args.push(l, l, l, l, l, l, l); }
  return { sql: LEAD_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY l.created_at DESC, l.id DESC', args };
}
router.get('/leads', async (req, res) => {
  const { sql, args } = leadQuery(req.query);
  const rows = (await db.all(sql + ' LIMIT 500', ...args)).map((r) => ({ ...r, data: JSON.parse(r.data || '{}') }));
  const counts = await db.all('SELECT status, COUNT(*) AS c FROM leads GROUP BY status');
  res.json({ rows, counts, forms: await db.all('SELECT type, title FROM forms ORDER BY type'), partners: await db.all('SELECT id, name FROM referral_partners ORDER BY name') });
});
router.get('/leads.csv', async (req, res) => {
  const { sql, args } = leadQuery(req.query);
  const rows = await db.all(sql, ...args);
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const keys = [...new Set(rows.flatMap((r) => Object.keys(JSON.parse(r.data || '{}'))))];
  const head = ['id', 'date (UTC)', 'form', 'status', 'name', 'email', 'phone', 'program', 'referral partner', 'referral code', 'referral method', 'referral other', 'commission status', 'commission amount', ...keys.map((k) => 'field: ' + k), 'notes'];
  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    const d = JSON.parse(r.data || '{}');
    lines.push([r.id, r.created_at, r.form_type, r.status, r.name, r.email, r.phone, r.program, r.partner_name, r.partner_code, r.referral_method, r.referral_other, r.commission_status, r.commission_amount, ...keys.map((k) => d[k] ?? ''), r.notes].map(cell).join(','));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ugec-leads-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send('﻿' + lines.join('\r\n'));
});

router.get('/referrals/summary', async (req, res) => {
  const partners = await db.all(`SELECT p.id, p.name, p.code, p.active, p.listed, p.commission_terms, p.email,
    p.portal_enabled, (p.password_hash != '') AS has_password, p.last_login, (p.reset_expires > ?) AS invited,
    COUNT(l.id) AS total,
    COALESCE(SUM(CASE WHEN l.status='consultation booked' THEN 1 ELSE 0 END),0) AS booked,
    COALESCE(SUM(CASE WHEN l.status='applied' THEN 1 ELSE 0 END),0) AS applied,
    COALESCE(SUM(CASE WHEN l.status='enrolled' THEN 1 ELSE 0 END),0) AS enrolled,
    COALESCE(SUM(CASE WHEN l.commission_status='pending' THEN l.commission_amount END),0) AS pending,
    COALESCE(SUM(CASE WHEN l.commission_status='approved' THEN l.commission_amount END),0) AS approved,
    COALESCE(SUM(CASE WHEN l.commission_status='paid' THEN l.commission_amount END),0) AS paid
    FROM referral_partners p LEFT JOIN leads l ON l.referral_partner_id = p.id GROUP BY p.id ORDER BY total DESC, p.name`, Date.now());
  const unattributed = (await db.get('SELECT COUNT(*) AS c FROM leads WHERE referral_partner_id IS NULL')).c;
  const other = (await db.get("SELECT COUNT(*) AS c FROM leads WHERE referral_partner_id IS NULL AND referral_other != ''")).c;
  res.json({ partners, unattributed, other, siteUrl: (process.env.SITE_URL || '').replace(/\/$/, '') });
});
router.post('/partners/:id/invite', async (req, res) => {
  const p = await db.get('SELECT id, name, email, portal_enabled FROM referral_partners WHERE id=?', req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (!p.email) return res.status(400).json({ error: `Add an email address for ${p.name} first (Admin > Referral partners > Edit). They sign in with it.` });
  if (!p.portal_enabled) return res.status(400).json({ error: `Portal sign-in is turned off for ${p.name}. Turn it on in Admin > Referral partners > Edit first.` });
  const link = portal.setPasswordLink(req, await portal.newResetCode(p.id, 24 * 7));
  let emailed = false;
  if (mailer.enabled()) {
    try { await mailer.sendPartnerLink({ to: p.email, name: p.name, link, kind: 'invite' }); emailed = true; } catch (e) { console.error('[mail]', e.message); }
  }
  res.locals.activity = `sent a portal sign-in invite to referral partner "${p.name}"`;
  res.json({ ok: true, link, emailed, email: p.email });
});
router.patch('/leads/:id', async (req, res) => {
  const b = req.body || {};
  const cur = await db.get('SELECT * FROM leads WHERE id=?', req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  if (b.status !== undefined && !LEAD_STATUSES.includes(b.status)) return res.status(400).json({ error: 'Unknown status.' });
  if (b.commission_status !== undefined && !COMMISSION_STATUSES.includes(b.commission_status)) return res.status(400).json({ error: 'Unknown commission status.' });
  let amount = cur.commission_amount;
  if (b.commission_amount !== undefined && b.commission_amount !== '') {
    amount = Number(b.commission_amount);
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Commission amount must be a number, 0 or more.' });
  }
  let pid = cur.referral_partner_id;
  if (b.referral_partner_id !== undefined) {
    pid = b.referral_partner_id ? Number(b.referral_partner_id) : null;
    if (pid && !(await db.get('SELECT 1 FROM referral_partners WHERE id=?', pid))) return res.status(400).json({ error: 'Unknown partner.' });
  }
  await db.run('UPDATE leads SET status=?, notes=?, commission_status=?, commission_amount=?, referral_partner_id=? WHERE id=?',
    b.status ?? cur.status, b.notes !== undefined ? String(b.notes).slice(0, 4000) : cur.notes,
    b.commission_status ?? cur.commission_status, amount, pid, cur.id);
  res.json({ ok: true });
});
router.delete('/leads/:id', async (req, res) => { await db.run('DELETE FROM leads WHERE id=?', req.params.id); res.json({ ok: true }); });

router.post('/uploads/:folder', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: uploads.MAX_BYTES }), (req, res) => {
  try { res.status(201).json({ url: uploads.save(req.params.folder, req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
const imageFields = (r) => r.fields.filter((f) => f.t === 'image').map((f) => f.n);

function resource(req, res, next) {
  const r = resources[req.params.res];
  if (!r || req.params.res === 'settingsFields') return res.status(404).json({ error: 'Unknown resource' });
  req.r = r; next();
}
const taken = async (table, where, value, exceptId) => !!(await db.get(`SELECT 1 FROM ${table} WHERE ${where} AND (? IS NULL OR id <> ?)`, value, exceptId ?? null, exceptId ?? null));
async function coerce(r, body, isCreate, exceptId) {
  const out = {};
  for (const f of r.fields) {
    if (f.n === r.id && !isCreate && !r.idEditable) continue;
    if (!(f.n in body)) { if (f.t === 'checkbox' && isCreate) out[f.n] = 0; continue; }
    let v = body[f.n];
    if (f.t === 'checkbox') v = v ? 1 : 0;
    else if (f.t === 'number') v = Number.parseInt(v, 10) || 0;
    else if (f.t === 'ref') v = v ? Number(v) : null;
    else if (f.t === 'select') {
      v = String(v ?? '');
      if (!f.o.some((o) => (Array.isArray(o) ? o[0] : o) === v)) throw new Error(`${f.l} has an invalid value.`);
    } else if (f.t === 'json' || f.t === 'list' || f.t === 'map') {
      v = structured(f, v);
      if (r.table === 'forms' && f.n === 'fields') v = checkFormFields(v);
    } else if (f.t === 'image') {
      v = String(v ?? '').trim();
      if (!validImage(v)) throw new Error(`${f.l} is not a valid image.`);
    } else v = String(v ?? '').trim();
    if (f.r && (v === '' || v == null)) throw new Error(`${f.l} is required.`);
    out[f.n] = v;
  }
  if (r.table === 'programs' || r.table === 'posts') {
    if (!out.slug) out.slug = slugify(out.name || out.title || '');
    else out.slug = slugify(out.slug);
  }
  if (r.table === 'forms' && out.type !== undefined) {
    out.type = slugify(out.type);
  }
  if (r.table === 'referral_partners') {
    const base = String(out.code || out.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (!base) throw new Error('Partner needs a name or code.');
    let c = base, n = 2;
    while (await taken('referral_partners', 'code=?', c, exceptId)) c = base.slice(0, 10) + n++;
    out.code = c;
  }
  if (r.table === 'referral_partners' && out.email && await taken('referral_partners', 'lower(email)=lower(?)', out.email, exceptId)) {
    throw new Error('Another referral partner already uses this email. Each partner needs their own email to sign in to the portal.');
  }
  if (r.table === 'programs') out.updated_at = db.now();
  return out;
}
async function uniqueSlug(table, slug, exceptId) {
  let s = slug, n = 2;
  while (await taken(table, 'slug=?', s, exceptId)) s = `${slug}-${n++}`;
  return s;
}
const dbError = (e) => (e && e.code && /^ER_|^SQLITE_/.test(e.code) ? 'That could not be saved. Check the values and try again.' : e.message);

router.get('/:res', resource, async (req, res) => {
  res.json(await db.all(`SELECT * FROM ${req.r.table} ORDER BY ${req.r.order}`));
});
router.post('/:res', resource, async (req, res) => {
  try {
    const d = await coerce(req.r, req.body || {}, true);
    if (d.slug) d.slug = await uniqueSlug(req.r.table, d.slug);
    if (req.r.table === 'forms' && await db.get('SELECT 1 FROM forms WHERE type=?', d.type)) throw new Error('A form with that key already exists.');
    if (req.r.table === 'referral_partners') d.created_at = db.now();
    const cols = Object.keys(d);
    const info = await db.run(`INSERT INTO ${req.r.table}(${cols.join(', ')}) VALUES(${cols.map(() => '?').join(', ')})`, ...cols.map((c) => d[c]));
    res.status(201).json({ ok: true, id: req.r.id === 'type' ? d.type : info.id });
  } catch (e) { if (e.code) console.error(e); res.status(400).json({ error: dbError(e) }); }
});
router.put('/:res/:id', resource, async (req, res) => {
  try {
    const key = req.r.id;
    const existing = await db.get(`SELECT * FROM ${req.r.table} WHERE ${key}=?`, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const d = await coerce(req.r, req.body || {}, false, existing.id);
    if (d.slug) d.slug = await uniqueSlug(req.r.table, d.slug, existing.id);
    const cols = Object.keys(d);
    await db.run(`UPDATE ${req.r.table} SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE ${key}=?`, ...cols.map((c) => d[c]), req.params.id);
    for (const n of imageFields(req.r)) if (n in d && d[n] !== existing[n]) uploads.remove(existing[n]); // replaced or removed photo
    res.json({ ok: true });
  } catch (e) { if (e.code) console.error(e); res.status(400).json({ error: dbError(e) }); }
});
router.delete('/:res/:id', resource, async (req, res) => {
  if (req.r.table === 'referral_partners' && await db.get('SELECT 1 FROM leads WHERE referral_partner_id=?', req.params.id))
    return res.status(400).json({ error: 'This partner has referred leads, so it cannot be deleted. Untick Active instead to stop new referrals.' });
  const existing = await db.get(`SELECT * FROM ${req.r.table} WHERE ${req.r.id}=?`, req.params.id);
  await db.run(`DELETE FROM ${req.r.table} WHERE ${req.r.id}=?`, req.params.id);
  if (existing) for (const n of imageFields(req.r)) uploads.remove(existing[n]);
  res.json({ ok: true });
});

router.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
  console.error(err); res.status(500).json({ error: 'Server error' });
});

module.exports = router;
