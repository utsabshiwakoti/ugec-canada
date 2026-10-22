const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const auth = require('../auth');
const resources = require('../resources');
const uploads = require('../uploads');

const router = express.Router();
const settingsFields = resources.settingsFields;
const LEAD_STATUSES = ['new', 'contacted', 'consultation booked', 'applied', 'enrolled', 'closed'];
const COMMISSION_STATUSES = ['none', 'pending', 'approved', 'paid', 'void'];

const backup = require('../backup');
const mailer = require('../mailer');
const fs = require('fs');

function logActivity(email, action) {
  db.prepare('INSERT INTO activity(user_email, action) VALUES(?,?)').run(String(email || ''), String(action).slice(0, 300));
  db.prepare('DELETE FROM activity WHERE id <= (SELECT MAX(id) FROM activity) - 5000').run(); // keep the latest 5000
}
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

const newPortalToken = () => require('crypto').randomBytes(24).toString('base64url');

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'item';

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' } });

router.post('/login', loginLimiter, (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email).toLowerCase().trim());
  if (!u || !auth.verifyPassword(String(password), u.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  auth.issue(res, u.id);
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
  logActivity(u.email, 'signed in');
  res.json({ ok: true, email: u.email });
});
router.post('/logout', (req, res) => { auth.clear(res); res.json({ ok: true }); });
router.get('/me', (req, res) => {
  const u = auth.currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  res.json(u);
});

router.use(auth.requireAuth);

router.use((req, res, next) => {
  if (req.method === 'GET' || req.path.startsWith('/uploads/') || req.path === '/logout') return next();
  res.on('finish', () => { if (res.statusCode < 400) logActivity(req.user.email, res.locals.activity || describe(req)); });
  next();
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.get('/users', (req, res) => {
  res.json({ me: req.user.id, users: db.prepare('SELECT id, email, created_at, last_login FROM users ORDER BY email').all() });
});
router.post('/users', (req, res) => {
  const email = String((req.body || {}).email || '').toLowerCase().trim(), password = String((req.body || {}).password || '');
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 12) return res.status(400).json({ error: 'The password must be at least 12 characters.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(400).json({ error: 'There is already a login for that email.' });
  db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(email, auth.hashPassword(password));
  res.locals.activity = `added admin user ${email}`;
  res.status(201).json({ ok: true });
});
router.delete('/users/:id', (req, res) => {
  const u = db.prepare('SELECT id, email FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own login. Ask another admin to do it.' });
  db.prepare('DELETE FROM users WHERE id=?').run(u.id);
  res.locals.activity = `removed admin user ${u.email}`;
  res.json({ ok: true });
});
router.get('/activity', (req, res) => res.json(db.prepare('SELECT user_email, action, created_at FROM activity ORDER BY id DESC LIMIT 200').all()));

router.get('/backup', (req, res) => res.json({ backups: backup.list(), keep: backup.KEEP }));
router.post('/backup/run', async (req, res, next) => {
  try { const r = await backup.run(); res.locals.activity = 'ran a backup'; res.json(r); } catch (e) { next(e); }
});
router.get('/backup/download', async (req, res, next) => {
  try {
    const file = await backup.snapshot();
    logActivity(req.user.email, 'downloaded a database backup');
    res.download(file, `ugec-backup-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rm(file, { force: true }, () => {}));
  } catch (e) { next(e); }
});

router.get('/email', (req, res) => res.json({ enabled: mailer.enabled() }));
router.post('/email/test', async (req, res) => {
  try { await mailer.sendTest(req.user.email); res.locals.activity = 'sent a test email'; res.json({ ok: true, to: req.user.email }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/password', (req, res) => {
  const { current = '', next = '' } = req.body || {};
  if (String(next).length < 12) return res.status(400).json({ error: 'New password must be at least 12 characters.' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!auth.verifyPassword(String(current), u.password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(auth.hashPassword(String(next)), u.id);
  res.json({ ok: true });
});

router.get('/schema', (req, res) => {
  const out = {};
  for (const [k, r] of Object.entries(resources)) if (k !== 'settingsFields') out[k] = { label: r.label, id: r.id, idEditable: !!r.idEditable, list: r.list, fields: r.fields };
  res.json({ resources: out, settingsFields, leadStatuses: LEAD_STATUSES, commissionStatuses: COMMISSION_STATUSES });
});

router.get('/settings', (req, res) => res.json(db.getSettings()));
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

router.put('/settings', (req, res) => {
  const body = req.body || {}, before = db.getSettings(), changes = [];
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
    db.setSetting(f.n, v);
    if (f.t === 'image' && before[f.n] !== v) uploads.remove(before[f.n]); // replaced or removed
  }
  res.json(db.getSettings());
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
router.get('/leads', (req, res) => {
  const { sql, args } = leadQuery(req.query);
  const rows = db.prepare(sql + ' LIMIT 500').all(...args).map((r) => ({ ...r, data: JSON.parse(r.data || '{}') }));
  const counts = db.prepare('SELECT status, COUNT(*) c FROM leads GROUP BY status').all();
  res.json({ rows, counts, forms: db.prepare('SELECT type,title FROM forms ORDER BY type').all(), partners: db.prepare('SELECT id,name FROM referral_partners ORDER BY name').all() });
});
router.get('/leads.csv', (req, res) => {
  const { sql, args } = leadQuery(req.query);
  const rows = db.prepare(sql).all(...args);
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
  res.send('\ufeff' + lines.join('\r\n'));
});

router.get('/referrals/summary', (req, res) => {
  const partners = db.prepare(`SELECT p.id, p.name, p.code, p.active, p.listed, p.commission_terms, p.portal_token, p.email,
    COUNT(l.id) AS total,
    COALESCE(SUM(l.status='consultation booked'),0) AS booked,
    COALESCE(SUM(l.status='applied'),0) AS applied,
    COALESCE(SUM(l.status='enrolled'),0) AS enrolled,
    COALESCE(SUM(CASE WHEN l.commission_status='pending' THEN l.commission_amount END),0) AS pending,
    COALESCE(SUM(CASE WHEN l.commission_status='approved' THEN l.commission_amount END),0) AS approved,
    COALESCE(SUM(CASE WHEN l.commission_status='paid' THEN l.commission_amount END),0) AS paid
    FROM referral_partners p LEFT JOIN leads l ON l.referral_partner_id = p.id GROUP BY p.id ORDER BY total DESC, p.name`).all();
  const unattributed = db.prepare('SELECT COUNT(*) c FROM leads WHERE referral_partner_id IS NULL').get().c;
  const other = db.prepare("SELECT COUNT(*) c FROM leads WHERE referral_partner_id IS NULL AND referral_other != ''").get().c;
  res.json({ partners, unattributed, other, siteUrl: (process.env.SITE_URL || '').replace(/\/$/, '') });
});
router.post('/partners/:id/portal-reset', (req, res) => {
  const p = db.prepare('SELECT id, name FROM referral_partners WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const token = newPortalToken();
  db.prepare('UPDATE referral_partners SET portal_token=? WHERE id=?').run(token, p.id);
  res.locals.activity = `reset the portal link for referral partner "${p.name}"`;
  res.json({ ok: true, token });
});
router.patch('/leads/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);
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
    if (pid && !db.prepare('SELECT 1 FROM referral_partners WHERE id=?').get(pid)) return res.status(400).json({ error: 'Unknown partner.' });
  }
  db.prepare('UPDATE leads SET status=?, notes=?, commission_status=?, commission_amount=?, referral_partner_id=? WHERE id=?').run(
    b.status ?? cur.status, b.notes !== undefined ? String(b.notes).slice(0, 4000) : cur.notes,
    b.commission_status ?? cur.commission_status, amount, pid, cur.id);
  res.json({ ok: true });
});
router.delete('/leads/:id', (req, res) => { db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id); res.json({ ok: true }); });

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
function coerce(r, body, isCreate, exceptId) {
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
    while (db.prepare('SELECT 1 FROM referral_partners WHERE code=? AND id IS NOT ?').get(c, exceptId ?? null)) c = base.slice(0, 10) + n++;
    out.code = c;
  }
  if (r.table === 'referral_partners' && isCreate) out.portal_token = newPortalToken();
  if (r.table === 'programs') out.updated_at =new Date().toISOString().replace('T', ' ').slice(0, 19);
  return out;
}
function uniqueSlug(table, slug, exceptId) {
  let s = slug, n = 2;
  while (db.prepare(`SELECT 1 FROM ${table} WHERE slug=? AND id IS NOT ?`).get(s, exceptId ?? null)) s = `${slug}-${n++}`;
  return s;
}

router.get('/:res', resource, (req, res) => {
  res.json(db.prepare(`SELECT * FROM ${req.r.table} ORDER BY ${req.r.order}`).all());
});
router.post('/:res', resource, (req, res) => {
  try {
    const d = coerce(req.r, req.body || {}, true);
    if (d.slug) d.slug = uniqueSlug(req.r.table, d.slug);
    if (req.r.table === 'forms' && db.prepare('SELECT 1 FROM forms WHERE type=?').get(d.type)) throw new Error('A form with that key already exists.');
    const cols = Object.keys(d);
    const info = db.prepare(`INSERT INTO ${req.r.table}(${cols.join(',')}) VALUES(${cols.map((c) => '@' + c).join(',')})`).run(d);
    res.status(201).json({ ok: true, id: req.r.id === 'type' ? d.type : info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/:res/:id', resource, (req, res) => {
  try {
    const key = req.r.id;
    const existing = db.prepare(`SELECT * FROM ${req.r.table} WHERE ${key}=?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const d = coerce(req.r, req.body || {}, false, existing.id);
    if (d.slug) d.slug = uniqueSlug(req.r.table, d.slug, existing.id);
    const cols = Object.keys(d);
    db.prepare(`UPDATE ${req.r.table} SET ${cols.map((c) => `${c}=@${c}`).join(',')} WHERE ${key}=@__id`).run({ ...d, __id: req.params.id });
    for (const n of imageFields(req.r)) if (n in d && d[n] !== existing[n]) uploads.remove(existing[n]); // replaced or removed photo
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/:res/:id', resource, (req, res) => {
  if (req.r.table === 'referral_partners' && db.prepare('SELECT 1 FROM leads WHERE referral_partner_id=?').get(req.params.id))
    return res.status(400).json({ error: 'This partner has referred leads, so it cannot be deleted. Untick Active instead to stop new referrals.' });
  const existing = db.prepare(`SELECT * FROM ${req.r.table} WHERE ${req.r.id}=?`).get(req.params.id);
  db.prepare(`DELETE FROM ${req.r.table} WHERE ${req.r.id}=?`).run(req.params.id);
  if (existing) for (const n of imageFields(req.r)) uploads.remove(existing[n]);
  res.json({ ok: true });
});

router.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
  console.error(err); res.status(500).json({ error: 'Server error' });
});

module.exports = router;
