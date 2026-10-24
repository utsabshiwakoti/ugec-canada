const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const auth = require('../auth');
const resources = require('../resources');
const uploads = require('../uploads');
const backup = require('../backup');
const mailer = require('../mailer');
const portal = require('./portal');
const totp = require('../totp');
const digest = require('../digest');
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

async function signedIn(res, u) {
  auth.issue(res, u);
  await db.run('UPDATE users SET last_login=? WHERE id=?', db.now(), u.id);
  log(u.email, 'signed in');
  res.json({ ok: true });
}
router.post('/login', loginLimiter, async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const u = await db.get('SELECT * FROM users WHERE email=?', String(email).toLowerCase().trim());
  if (!u || !auth.verifyPassword(String(password), u.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (u.totp_on) { auth.issuePending(res, u); return res.json({ need2fa: true }); }
  await signedIn(res, u);
});
router.post('/login/2fa', loginLimiter, async (req, res) => {
  const u = await auth.pendingUser(req);
  if (!u) return res.status(401).json({ error: 'Your sign-in timed out. Enter your email and password again.', restart: true });
  const step = totp.verify(u.totp_secret, (req.body || {}).code, Number(u.totp_last));
  if (!step) return res.status(401).json({ error: 'That code is not right. Use the newest code in your authenticator app.' });
  await db.run('UPDATE users SET totp_last=? WHERE id=?', step, u.id);
  await signedIn(res, u);
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

const STAFF_OK = [
  /^GET \/(schema|dashboard|leads|leads\.csv|assignees|account)$/, /^GET \/leads\/\d+(\/events)?$/,
  /^PATCH \/leads\/\d+$/, /^POST \/leads\/\d+\/(events|contact)$/, /^POST \/leads\/bulk$/,
  /^POST \/(password|account|2fa\/setup|2fa\/enable|2fa\/disable)$/,
];
router.use((req, res, next) => (req.user.admin || STAFF_OK.some((r) => r.test(`${req.method} ${req.path}`)) ? next() : auth.requireAdmin(req, res, next)));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'staff'];
router.get('/users', async (req, res) => {
  res.json({ me: req.user.id, users: await db.all('SELECT id, email, name, role, totp_on, created_at, last_login FROM users ORDER BY name, email') });
});
router.get('/assignees', async (req, res) => res.json(await db.all("SELECT id, CASE WHEN name != '' THEN name ELSE email END AS name FROM users ORDER BY name")));
router.post('/users', async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').toLowerCase().trim(), password = String(b.password || ''), name = String(b.name || '').trim().slice(0, 100);
  const role = ROLES.includes(b.role) ? b.role : 'staff';
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 12) return res.status(400).json({ error: 'The password must be at least 12 characters.' });
  if (await db.get('SELECT 1 FROM users WHERE email=?', email)) return res.status(400).json({ error: 'There is already a login for that email.' });
  await db.run('INSERT INTO users(email, name, role, password_hash, created_at) VALUES(?,?,?,?,?)', email, name, role, auth.hashPassword(password), db.now());
  res.locals.activity = `added ${role} login ${email}`;
  res.status(201).json({ ok: true });
});
const adminCount = async () => (await db.get("SELECT COUNT(*) AS c FROM users WHERE role != 'staff'")).c;
router.patch('/users/:id', async (req, res) => {
  const b = req.body || {};
  const u = await db.get('SELECT id, email, name, role FROM users WHERE id=?', req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'Unknown role.' });
    if (u.id === req.user.id && b.role !== u.role) return res.status(400).json({ error: 'You cannot change your own role. Ask another admin.' });
    if (u.role !== 'staff' && b.role === 'staff' && (await adminCount()) < 2) return res.status(400).json({ error: 'There must always be at least one admin.' });
    await db.run('UPDATE users SET role=? WHERE id=?', b.role, u.id);
    res.locals.activity = `changed ${u.email} to ${b.role}`;
  }
  if (b.name !== undefined) await db.run('UPDATE users SET name=? WHERE id=?', String(b.name).trim().slice(0, 100), u.id);
  if (b.reset2fa) {
    await db.run("UPDATE users SET totp_on=0, totp_secret='' WHERE id=?", u.id);
    res.locals.activity = `turned off two-step sign-in for ${u.email}`;
  }
  res.json({ ok: true });
});
router.delete('/users/:id', async (req, res) => {
  const u = await db.get('SELECT id, email, role FROM users WHERE id=?', req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own login. Ask another admin to do it.' });
  if (u.role !== 'staff' && (await adminCount()) < 2) return res.status(400).json({ error: 'There must always be at least one admin.' });
  await db.run('UPDATE leads SET assigned_to=NULL WHERE assigned_to=?', u.id);
  await db.run('DELETE FROM users WHERE id=?', u.id);
  res.locals.activity = `removed login ${u.email}`;
  res.json({ ok: true });
});

router.get('/account', async (req, res) => res.json(await db.get('SELECT email, name, role, totp_on, digest FROM users WHERE id=?', req.user.id)));
router.post('/account', async (req, res) => {
  const b = req.body || {};
  if (b.name !== undefined) await db.run('UPDATE users SET name=? WHERE id=?', String(b.name).trim().slice(0, 100), req.user.id);
  if (b.digest !== undefined) await db.run('UPDATE users SET digest=? WHERE id=?', b.digest ? 1 : 0, req.user.id);
  res.locals.activity = 'updated their account';
  res.json({ ok: true });
});
router.post('/2fa/setup', async (req, res) => {
  if (req.user.totp_on) return res.status(400).json({ error: 'Two-step sign-in is already on.' });
  const secret = totp.newSecret();
  await db.run('UPDATE users SET totp_secret=? WHERE id=?', secret, req.user.id);
  const qr = await require('qrcode').toDataURL(totp.uri(secret, req.user.email), { margin: 1, width: 220 });
  res.locals.activity = 'started setting up two-step sign-in';
  res.json({ secret: secret.replace(/(.{4})/g, '$1 ').trim(), qr });
});
router.post('/2fa/enable', async (req, res) => {
  const u = await db.get('SELECT * FROM users WHERE id=?', req.user.id);
  if (!u.totp_secret) return res.status(400).json({ error: 'Start again: click "Turn on two-step sign-in".' });
  const step = totp.verify(u.totp_secret, (req.body || {}).code, 0);
  if (!step) return res.status(400).json({ error: 'That code is not right. Type the 6-digit code your app shows now.' });
  await db.run('UPDATE users SET totp_on=1, totp_last=? WHERE id=?', step, u.id);
  auth.issue(res, { ...u, totp_on: 1 }); // stay signed in on this device
  res.locals.activity = 'turned on two-step sign-in';
  res.json({ ok: true });
});
router.post('/2fa/disable', async (req, res) => {
  const u = await db.get('SELECT * FROM users WHERE id=?', req.user.id);
  if (!auth.verifyPassword(String((req.body || {}).password || ''), u.password_hash)) return res.status(400).json({ error: 'Your password is incorrect.' });
  await db.run("UPDATE users SET totp_on=0, totp_secret='' WHERE id=?", u.id);
  auth.issue(res, { ...u, totp_on: 0 });
  res.locals.activity = 'turned off two-step sign-in';
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
  const hash = auth.hashPassword(String(next));
  await db.run('UPDATE users SET password_hash=? WHERE id=?', hash, u.id);
  auth.issue(res, { ...u, password_hash: hash }); // other devices are signed out; this one stays in
  res.json({ ok: true });
});

router.get('/schema', (req, res) => {
  const out = {};
  for (const [k, r] of Object.entries(resources)) if (k !== 'settingsFields') out[k] = { label: r.label, id: r.id, idEditable: !!r.idEditable, list: r.list, fields: r.fields };
  res.json({ resources: req.user.admin ? out : {}, settingsFields: req.user.admin ? settingsFields : [], leadStatuses: LEAD_STATUSES, commissionStatuses: COMMISSION_STATUSES, user: req.user });
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
    if (!f.n || !(f.n in body)) continue;
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
    if (f.t === 'lines') v = String(v ?? '').split('\n').map((x) => x.trim()).filter(Boolean).join('\n');
    if (f.t === 'text' || f.t === 'textarea') v = String(v ?? '').trim();
    changes.push([f, v]);
  }
  for (const [f, v] of changes) {
    await db.setSetting(f.n, v);
    if (f.t === 'image' && before[f.n] !== v) uploads.remove(before[f.n]); // replaced or removed
  }
  res.json(await db.getSettings());
});

const OPEN = "l.status NOT IN ('enrolled','closed')";
const LEAD_SELECT = `SELECT l.*, p.name AS partner_name, p.code AS partner_code,
  CASE WHEN u.name != '' THEN u.name ELSE u.email END AS assignee
  FROM leads l LEFT JOIN referral_partners p ON p.id = l.referral_partner_id LEFT JOIN users u ON u.id = l.assigned_to`;
function leadQuery(q, user) {
  const where = []; const args = [];
  if (q.status === 'open') where.push(OPEN);
  else if (q.status && q.status !== 'all') { where.push('l.status=?'); args.push(q.status); }
  if (q.form && q.form !== 'all') { where.push('l.form_type=?'); args.push(q.form); }
  if (q.partner === 'none') where.push('l.referral_partner_id IS NULL');
  else if (q.partner === 'any') where.push('l.referral_partner_id IS NOT NULL');
  else if (q.partner && q.partner !== 'all') { where.push('l.referral_partner_id=?'); args.push(Number(q.partner) || 0); }
  if (q.assigned === 'me') { where.push('l.assigned_to=?'); args.push(user.id); }
  else if (q.assigned === 'none') where.push('l.assigned_to IS NULL');
  else if (q.assigned && q.assigned !== 'all') { where.push('l.assigned_to=?'); args.push(Number(q.assigned) || 0); }
  if (q.due === '1') { where.push(`l.follow_up != '' AND l.follow_up <= ? AND ${OPEN}`); args.push(digest.today()); }
  if (q.ids) { const ids = String(q.ids).split(',').map(Number).filter(Boolean).slice(0, 1000); where.push(`l.id IN (${ids.map(() => '?').join(',') || 'NULL'})`); args.push(...ids); }
  if (q.q) { where.push('(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.program LIKE ? OR l.data LIKE ? OR p.name LIKE ? OR l.referral_other LIKE ?)'); const l = `%${q.q}%`; args.push(l, l, l, l, l, l, l); }
  return { sql: LEAD_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY l.created_at DESC, l.id DESC', args };
}
const forRole = (user, r) => (user.admin ? r : (({ commission_status, commission_amount, ...rest }) => rest)(r));
const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10);
async function duplicates() {
  const by = new Map();
  for (const r of await db.all('SELECT id, email, phone FROM leads')) {
    for (const k of [r.email && 'e:' + r.email.toLowerCase().trim(), phoneKey(r.phone).length >= 7 && 'p:' + phoneKey(r.phone)]) {
      if (k) by.set(k, [...(by.get(k) || []), r.id]);
    }
  }
  return (r) => [...new Set([r.email && 'e:' + r.email.toLowerCase().trim(), phoneKey(r.phone).length >= 7 && 'p:' + phoneKey(r.phone)]
    .filter(Boolean).flatMap((k) => by.get(k) || []))].filter((id) => id !== r.id);
}
router.get('/leads', async (req, res) => {
  const { sql, args } = leadQuery(req.query, req.user);
  const dupes = await duplicates();
  const rows = (await db.all(sql + ' LIMIT 500', ...args)).map((r) => forRole(req.user, { ...r, data: JSON.parse(r.data || '{}'), dupes: dupes(r) }));
  const counts = await db.all('SELECT status, COUNT(*) AS c FROM leads GROUP BY status');
  res.json({ rows, counts, today: digest.today(), forms: await db.all('SELECT type, title FROM forms ORDER BY type'),
    partners: req.user.admin ? await db.all('SELECT id, name FROM referral_partners ORDER BY name') : [] });
});
router.get('/leads/:id(\\d+)', async (req, res) => {
  const r = await db.get(LEAD_SELECT + ' WHERE l.id=?', req.params.id);
  if (!r) return res.status(404).json({ error: 'This lead no longer exists.' });
  res.json(forRole(req.user, { ...r, data: JSON.parse(r.data || '{}'), dupes: (await duplicates())(r) }));
});
router.get('/leads.csv', async (req, res) => {
  const { sql, args } = leadQuery(req.query, req.user);
  const rows = await db.all(sql, ...args);
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const keys = [...new Set(rows.flatMap((r) => Object.keys(JSON.parse(r.data || '{}'))))];
  const money = req.user.admin;
  const head = ['id', 'date (UTC)', 'form', 'status', 'assigned to', 'follow-up', 'paid', 'name', 'email', 'phone', 'program', 'referral partner', 'referral code', 'referral method', 'referral other',
    ...(money ? ['commission status', 'commission amount'] : []), ...keys.map((k) => 'field: ' + k), 'notes'];
  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    const d = JSON.parse(r.data || '{}');
    lines.push([r.id, r.created_at, r.form_type, r.status, r.assignee, r.follow_up, r.paid ? 'yes' : '', r.name, r.email, r.phone, r.program, r.partner_name, r.partner_code, r.referral_method, r.referral_other,
      ...(money ? [r.commission_status, r.commission_amount] : []), ...keys.map((k) => d[k] ?? ''), r.notes].map(cell).join(','));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ugec-leads-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send('\ufeff' + lines.join('\r\n'));
});

router.get('/dashboard', async (req, res) => {
  const today = digest.today(), me = req.user.id;
  const one = async (sql, ...a) => (await db.get(sql, ...a)).c;
  const since = new Date(Date.now() - 7 * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  const since90 = new Date(Date.now() - 90 * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - 7 * 11);
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: new Date(start.getTime() + i * 7 * 864e5).toISOString().slice(0, 10), count: 0 }));
  for (const r of await db.all('SELECT created_at FROM leads WHERE created_at >= ?', start.toISOString().replace('T', ' ').slice(0, 19))) {
    const i = Math.floor((new Date(r.created_at.replace(' ', 'T') + 'Z') - start) / (7 * 864e5));
    if (weeks[i]) weeks[i].count++;
  }
  const L = 'SELECT COUNT(*) AS c FROM leads l WHERE ';
  res.json({
    today,
    totals: {
      fresh: await one(L + "l.status='new'"),
      unassigned: await one(L + "l.status='new' AND l.assigned_to IS NULL"),
      week: await one(L + 'l.created_at >= ?', since),
      open: await one(L + OPEN),
      due: await one(L + `l.follow_up != '' AND l.follow_up <= ? AND ${OPEN}`, today),
      myDue: await one(L + `l.assigned_to=? AND l.follow_up != '' AND l.follow_up <= ? AND ${OPEN}`, me, today),
      mine: await one(L + `l.assigned_to=? AND ${OPEN}`, me),
      total90: await one(L + 'l.created_at >= ?', since90),
      enrolled90: await one(L + "l.status='enrolled' AND l.created_at >= ?", since90),
    },
    weeks,
    byStatus: await db.all('SELECT status, COUNT(*) AS c FROM leads GROUP BY status'),
    byForm: await db.all('SELECT l.form_type AS type, COALESCE(f.title, l.form_type) AS title, COUNT(*) AS c FROM leads l LEFT JOIN forms f ON f.type = l.form_type WHERE l.created_at >= ? GROUP BY l.form_type, f.title ORDER BY c DESC', since90),
    byPartner: req.user.admin ? await db.all('SELECT p.name, COUNT(*) AS c FROM leads l JOIN referral_partners p ON p.id = l.referral_partner_id WHERE l.created_at >= ? GROUP BY p.id, p.name ORDER BY c DESC LIMIT 6', since90) : [],
    followUps: await db.all(`${LEAD_SELECT} WHERE l.follow_up != '' AND l.follow_up <= ? AND ${OPEN} ORDER BY l.follow_up, l.id LIMIT 50`, today),
    recent: await db.all(`${LEAD_SELECT} ORDER BY l.created_at DESC, l.id DESC LIMIT 6`),
  });
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
const event = (leadId, email, kind, text) => db.run('INSERT INTO lead_events(lead_id, user_email, kind, text, created_at) VALUES(?,?,?,?,?)', leadId, email, kind, String(text).slice(0, 4000), db.now());
router.get('/leads/:id/events', async (req, res) => res.json(await db.all('SELECT user_email, kind, text, created_at FROM lead_events WHERE lead_id=? ORDER BY id DESC', req.params.id)));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
async function updateLead(user, id, b) {
  const cur = await db.get('SELECT * FROM leads WHERE id=?', id);
  if (!cur) throw Object.assign(new Error('Not found'), { status: 404 });
  const next = {}, log = [];
  if (b.status !== undefined && b.status !== cur.status) {
    if (!LEAD_STATUSES.includes(b.status)) throw new Error('Unknown status.');
    next.status = b.status; log.push(['status', `Status: ${cur.status} → ${b.status}`]);
  }
  if (b.assigned_to !== undefined) {
    const to = b.assigned_to ? Number(b.assigned_to) : null;
    if (to !== cur.assigned_to) {
      const u = to && await db.get("SELECT CASE WHEN name != '' THEN name ELSE email END AS name FROM users WHERE id=?", to);
      if (to && !u) throw new Error('Unknown team member.');
      next.assigned_to = to; log.push(['assign', to ? `Assigned to ${u.name}` : 'Unassigned']);
    }
  }
  if (b.follow_up !== undefined && String(b.follow_up) !== cur.follow_up) {
    const d = String(b.follow_up || '');
    if (d && !DATE.test(d)) throw new Error('Follow-up date is not valid.');
    next.follow_up = d; log.push(['follow', d ? `Follow-up set for ${d}` : 'Follow-up cleared']);
  }
  if (b.paid !== undefined && (b.paid ? 1 : 0) !== cur.paid) { next.paid = b.paid ? 1 : 0; log.push(['paid', b.paid ? 'Marked as paid' : 'Marked as not paid']); }
  if (user.admin) {
    if (b.referral_partner_id !== undefined) {
      const pid = b.referral_partner_id ? Number(b.referral_partner_id) : null;
      if (pid !== cur.referral_partner_id) {
        const p = pid && await db.get('SELECT name FROM referral_partners WHERE id=?', pid);
        if (pid && !p) throw new Error('Unknown partner.');
        next.referral_partner_id = pid; log.push(['partner', pid ? `Referral partner set to ${p.name}` : 'Referral partner removed']);
      }
    }
    if (b.commission_status !== undefined && b.commission_status !== cur.commission_status) {
      if (!COMMISSION_STATUSES.includes(b.commission_status)) throw new Error('Unknown commission status.');
      next.commission_status = b.commission_status; log.push(['commission', `Commission: ${b.commission_status}`]);
    }
    if (b.commission_amount !== undefined && b.commission_amount !== '' && Number(b.commission_amount) !== Number(cur.commission_amount)) {
      const amount = Number(b.commission_amount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Commission amount must be a number, 0 or more.');
      next.commission_amount = amount; log.push(['commission', `Commission amount: $${amount.toFixed(2)}`]);
    }
  }
  if (b.notes !== undefined) next.notes = String(b.notes).slice(0, 4000);
  const cols = Object.keys(next);
  if (cols.length) await db.run(`UPDATE leads SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`, ...cols.map((c) => next[c]), id);
  for (const [kind, text] of log) await event(id, user.email, kind, text);
  if (String(b.note || '').trim()) await event(id, user.email, 'note', String(b.note).trim());
}
router.patch('/leads/:id', async (req, res) => {
  try { await updateLead(req.user, Number(req.params.id), req.body || {}); res.json({ ok: true }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
router.post('/leads/:id/events', async (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Write a note first.' });
  if (!(await db.get('SELECT 1 FROM leads WHERE id=?', req.params.id))) return res.status(404).json({ error: 'Not found' });
  await event(Number(req.params.id), req.user.email, 'note', text);
  res.locals.activity = `added a note to lead #${req.params.id}`;
  res.json({ ok: true });
});
const VIA = { whatsapp: 'Opened WhatsApp to message them', email: 'Started an email to them', call: 'Called them' };
router.post('/leads/:id/contact', async (req, res) => {
  const via = VIA[(req.body || {}).via];
  if (!via) return res.status(400).json({ error: 'Bad request' });
  if (!(await db.get('SELECT 1 FROM leads WHERE id=?', req.params.id))) return res.status(404).json({ error: 'Not found' });
  await event(Number(req.params.id), req.user.email, 'contact', via);
  res.locals.activity = `contacted lead #${req.params.id} (${req.body.via})`;
  res.json({ ok: true });
});
router.post('/leads/bulk', async (req, res) => {
  const b = req.body || {};
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean))].slice(0, 500);
  if (!ids.length) return res.status(400).json({ error: 'Select some leads first.' });
  const ACT = { status: 'status', assign: 'assigned_to', follow: 'follow_up' };
  if (b.action === 'delete') {
    if (!req.user.admin) return res.status(403).json({ error: 'Only admins can delete leads.' });
    for (const id of ids) { await db.run('DELETE FROM lead_events WHERE lead_id=?', id); await db.run('DELETE FROM leads WHERE id=?', id); }
  } else if (ACT[b.action]) {
    try { for (const id of ids) await updateLead(req.user, id, { [ACT[b.action]]: b.value }); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  } else return res.status(400).json({ error: 'Unknown action.' });
  res.locals.activity = `${b.action === 'delete' ? 'deleted' : 'updated'} ${ids.length} lead${ids.length === 1 ? '' : 's'} at once (${b.action})`;
  res.json({ ok: true, count: ids.length });
});
router.delete('/leads/:id', async (req, res) => {
  await db.run('DELETE FROM lead_events WHERE lead_id=?', req.params.id);
  await db.run('DELETE FROM leads WHERE id=?', req.params.id);
  res.json({ ok: true });
});

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
