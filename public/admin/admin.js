(() => {
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#root');
let schema = null, me = null, tab = 'dashboard', flash = null;

async function api(path, opt = {}) {
  const r = await fetch('/admin/api' + path, { credentials: 'same-origin', ...opt,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ugec', ...(opt.headers || {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { me = null; login(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
const SHAPES = {
  free: { label: 'Original shape', ratio: null }, square: { label: 'Square', ratio: 1 }, circle: { label: 'Circle', ratio: 1, round: true },
  wide: { label: 'Wide', ratio: 3 }, landscape: { label: 'Landscape', ratio: 4 / 3 }, portrait: { label: 'Portrait', ratio: 3 / 4 },
  share: { label: 'Link preview', ratio: 1200 / 630 },
};
function cropImage(src, { shapes = ['free'], max = 1600, format = 'jpeg' } = {}) {
  const png = format === 'png';
  let img = src, shape = SHAPES[shapes[0]] ? shapes[0] : 'free';
  let f = null, s = 1, ix = 0, iy = 0, cover = 1, minS = 1, maxS = 1, W = 0, H = 0;
  const dlg = document.createElement('dialog');
  dlg.className = 'crop';
  dlg.innerHTML = `<h2>Adjust the photo</h2>
    ${shapes.length > 1 ? `<div class="crop-shapes" role="radiogroup" aria-label="Shape">${shapes.map((k) => `<button type="button" role="radio" aria-checked="${k === shape}" data-shape="${k}">${esc(SHAPES[k].label)}</button>`).join('')}</div>` : ''}
    <canvas class="crop-stage" tabindex="0" aria-label="Photo. Drag or use the arrow keys to move it, and + or - to zoom."></canvas>
    <div class="crop-tools"><label for="crop-zoom">Zoom</label><input type="range" id="crop-zoom" min="0" max="1000" value="0">
      <button type="button" class="b line" data-rot>Rotate</button><button type="button" class="b line" data-reset>Reset</button></div>
    <p class="hint">Drag the photo to move it. Zoom with the slider, the mouse wheel or two fingers.${png ? ' Zoom out to leave space around a logo.' : ''}</p>
    <div class="bar"><button type="button" class="b" data-ok>Use this photo</button><button type="button" class="b line" data-cancel>Cancel</button></div>`;
  document.body.append(dlg);
  const cv = dlg.querySelector('canvas'), g = cv.getContext('2d'), zoom = dlg.querySelector('#crop-zoom');
  const iw = () => img.width, ih = () => img.height;
  const round = () => !!SHAPES[shape].round;

  const clamp = () => {
    s = Math.min(maxS, Math.max(minS, s));
    const axis = (pos, size, start, len) => (size >= len ? Math.min(start, Math.max(start + len - size, pos)) : Math.max(start, Math.min(start + len - size, pos)));
    ix = axis(ix, iw() * s, f.x, f.w); iy = axis(iy, ih() * s, f.y, f.h);
  };
  const frame = (p) => { if (round()) p.ellipse(f.x + f.w / 2, f.y + f.h / 2, f.w / 2, f.h / 2, 0, 0, Math.PI * 2); else p.rect(f.x, f.y, f.w, f.h); };
  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1B2333'; g.fillRect(0, 0, W, H);
    if (png) { // checkerboard where the result will be see-through
      for (let y = 0; y < f.h; y += 10) for (let x = 0; x < f.w; x += 10) {
        g.fillStyle = (x + y) / 10 % 2 ? '#E3E8F0' : '#fff'; g.fillRect(f.x + x, f.y + y, Math.min(10, f.w - x), Math.min(10, f.h - y));
      }
    } else { g.fillStyle = '#fff'; g.fillRect(f.x, f.y, f.w, f.h); }
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, ix, iy, iw() * s, ih() * s);
    const shade = new Path2D(); shade.rect(0, 0, W, H); frame(shade);
    g.fillStyle = 'rgba(10,16,30,.62)'; g.fill(shade, 'evenodd');
    const edge = new Path2D(); frame(edge);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(edge);
  };
  const syncZoom = () => { zoom.value = String(Math.round(1000 * Math.log(s / minS) / Math.log(maxS / minS)) || 0); };
  const zoomAt = (ns, cx = f.x + f.w / 2, cy = f.y + f.h / 2) => {
    ns = Math.min(maxS, Math.max(minS, ns));
    ix = cx - (cx - ix) * ns / s; iy = cy - (cy - iy) * ns / s; s = ns;
    clamp(); syncZoom(); draw();
  };
  const fit = (keep) => {
    const was = keep && f ? { cx: (f.x + f.w / 2 - ix) / s, cy: (f.y + f.h / 2 - iy) / s, rel: s / cover } : null;
    W = cv.clientWidth; H = Math.max(240, Math.min(420, Math.round(W * 0.68)));
    const dpr = window.devicePixelRatio || 1;
    cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ratio = SHAPES[shape].ratio || iw() / ih(), pad = 20;
    const fw = Math.min(W - 2 * pad, (H - 2 * pad) * ratio), fh = fw / ratio;
    f = { x: (W - fw) / 2, y: (H - fh) / 2, w: fw, h: fh };
    cover = Math.max(fw / iw(), fh / ih());
    const contain = Math.min(fw / iw(), fh / ih());
    minS = png ? contain / 2 : cover; maxS = Math.max(cover * 6, minS * 4);
    s = Math.min(maxS, Math.max(minS, was ? was.rel * cover : png ? contain : cover));
    ix = f.x + f.w / 2 - (was ? was.cx : iw() / 2) * s; iy = f.y + f.h / 2 - (was ? was.cy : ih() / 2) * s;
    clamp(); syncZoom(); draw();
  };
  const rotate = () => {
    const c = document.createElement('canvas'); c.width = ih(); c.height = iw();
    const cg = c.getContext('2d'); cg.translate(c.width, 0); cg.rotate(Math.PI / 2); cg.drawImage(img, 0, 0);
    img = c; fit(false);
  };
  const result = () => new Promise((ok) => {
    const r = Math.min(max / Math.max(f.w, f.h), 1 / s), asPng = png || round();
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(f.w * r)); c.height = Math.max(1, Math.round(f.h * r));
    const cg = c.getContext('2d');
    if (!asPng) { cg.fillStyle = '#fff'; cg.fillRect(0, 0, c.width, c.height); } // JPEG has no transparency
    if (round()) { cg.beginPath(); cg.ellipse(c.width / 2, c.height / 2, c.width / 2, c.height / 2, 0, 0, Math.PI * 2); cg.clip(); }
    cg.imageSmoothingQuality = 'high';
    cg.drawImage(img, (ix - f.x) * r, (iy - f.y) * r, iw() * s * r, ih() * s * r);
    c.toBlob(ok, asPng ? 'image/png' : 'image/jpeg', 0.9);
  });

  const pts = new Map();
  let pinch = null;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); pinch = null; });
  cv.addEventListener('pointermove', (e) => {
    const last = pts.get(e.pointerId); if (!last) return;
    pts.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pts.size === 1) { ix += e.offsetX - last[0]; iy += e.offsetY - last[1]; clamp(); draw(); return; }
    const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) zoomAt(s * d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    pinch = d;
  });
  const up = (e) => { pts.delete(e.pointerId); pinch = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
  cv.addEventListener('keydown', (e) => {
    const mv = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
    if (mv) { e.preventDefault(); ix += mv[0]; iy += mv[1]; clamp(); draw(); }
    else if (e.key === '+' || e.key === '=') zoomAt(s * 1.1); else if (e.key === '-') zoomAt(s / 1.1);
  });
  zoom.addEventListener('input', () => zoomAt(minS * (maxS / minS) ** (zoom.value / 1000)));
  dlg.querySelectorAll('[data-shape]').forEach((b) => b.addEventListener('click', () => {
    shape = b.dataset.shape;
    dlg.querySelectorAll('[data-shape]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    fit(true);
  }));
  dlg.querySelector('[data-rot]').onclick = rotate;
  dlg.querySelector('[data-reset]').onclick = () => { img = src; fit(false); };
  const onResize = () => fit(true);
  window.addEventListener('resize', onResize);

  return new Promise((done) => {
    const finish = (blob) => { window.removeEventListener('resize', onResize); dlg.close(); dlg.remove(); if (src.close) src.close(); done(blob); };
    dlg.querySelector('[data-ok]').onclick = async () => finish(await result());
    dlg.querySelector('[data-cancel]').onclick = () => finish(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); }); // Escape key
    dlg.showModal();
    fit(false);
    cv.focus();
  });
}
async function uploadPhoto(folder, blob) {
  const r = await fetch('/admin/api/uploads/' + folder, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type, 'X-Requested-With': 'ugec' }, body: blob });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { me = null; login(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(j.error || 'Upload failed');
  return j.url;
}
function imageField(box, form) {
  const hidden = box.querySelector('input[type=hidden]'), file = box.querySelector('input[type=file]');
  const prev = box.querySelector('.img-prev'), clear = box.querySelector('[data-clear]'), note = box.querySelector('.hint');
  const pick = box.querySelector('[data-pick]'), adjust = box.querySelector('[data-adjust]'), help = note.textContent;
  const show = (url) => { prev.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<span>None</span>'; clear.hidden = adjust.hidden = !url; pick.textContent = url ? 'Change' : 'Upload'; };
  pick.onclick = () => file.click();
  const changed = () => hidden.dispatchEvent(new Event('change', { bubbles: true })); // lets previews follow along
  clear.onclick = () => { hidden.value = ''; show(''); changed(); note.textContent = 'Removed. Click Save to apply.'; };
  const opts = { shapes: (box.dataset.shapes || 'free').split(','), max: Number(box.dataset.max) || 1600, format: box.dataset.format };
  const edit = async (load) => {
    let src;
    try { src = await load(); } catch { note.textContent = 'Could not read that image. Please use a JPG, PNG or WebP file.'; return; }
    const blob = await cropImage(src, opts);
    if (!blob) { note.textContent = help; return; }
    const save = form.querySelector('button[type=submit]');
    note.textContent = 'Uploading...'; save.disabled = true;
    try { hidden.value = await uploadPhoto(box.dataset.folder, blob); show(hidden.value); changed(); note.textContent = 'Image ready. Click Save to apply.'; }
    catch (x) { note.textContent = x.message; }
    finally { save.disabled = false; }
  };
  file.onchange = () => { const f = file.files[0]; file.value = ''; if (f) edit(() => createImageBitmap(f)); };
  adjust.onclick = () => edit(async () => {
    const r = await fetch(hidden.value, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Image not found');
    return createImageBitmap(await r.blob());
  });
}
let screenNo = 0;
const newScreen = () => { const n = ++screenNo; return () => n === screenNo; };
const msg = () => { const m = flash; flash = null; return m ? `<div class="msg ${m.t}" role="status">${esc(m.m)}</div>` : ''; };
const say = (m, t = 'ok') => { flash = { m, t }; };

const when = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
const shortWhen = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');
const day = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const money = (n) => '$' + Number(n || 0).toFixed(2);
const ICONS = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', inbox: 'M4 13h4l2 3h4l2-3h4M5.5 5h13l1.5 8v6H4v-6z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5M21 19v-1a4 4 0 0 0-3-3.9M16 4.1a3.25 3.25 0 0 1 0 6.3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
  building: 'M4 21h16M6 21V5l6-2 6 2v16M10 21v-4h4v4M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', card: 'M3 6h18v12H3zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M5.5 16a3.5 3.5 0 0 1 7 0M15 10h3M15 14h3',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  shield: 'M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z', user: 'M19 20v-1a5 5 0 0 0-5-5h-4a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  out: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h11', ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6', menu: 'M4 7h16M4 12h16M4 17h16', x: 'M6 6l12 12M18 6L6 18',
  chat: 'M4.5 19.5l1.3-3.6A7.5 7.5 0 1 1 8.6 18.4z', mail: 'M3.5 6h17v12h-17zM4 7l8 6 8-6',
  phone: 'M5 4h3.5l2 5-2.3 1.4a11 11 0 0 0 5.4 5.4L15 13.5l5 2V19a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14', plus: 'M12 5v14M5 12h14',
};
const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
const STATUS_CLASS = { new: 'new', contacted: 'contacted', 'consultation booked': 'booked', applied: 'applied', enrolled: 'enrolled', closed: 'closed' };
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const statusBadge = (s) => `<span class="badge st-${STATUS_CLASS[s] || 'closed'}">${esc(s)}</span>`;
function followBadge(d, today) {
  if (!d) return '<span class="muted">-</span>';
  if (d < today) return `<span class="badge due-late">Overdue · ${esc(day(d))}</span>`;
  if (d === today) return '<span class="badge due-today">Today</span>';
  return `<span class="badge">${esc(day(d))}</span>`;
}
const initials = (s) => String(s || '?').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

function login(error, step2 = false) {
  root.innerHTML = `<div class="login-wrap"><form class="login" id="lf" novalidate>
    <div class="login-brand"><span class="mk">U</span><div><b>UGEC Canada</b><small>Admin panel</small></div></div>
    <h1>${step2 ? 'Enter your code' : 'Sign in'}</h1>
    <p class="muted">${step2 ? 'Open your authenticator app and type the 6-digit code for UGEC Canada.' : 'Use the email and password for your admin login.'}</p>
    ${error ? `<div class="msg err" role="alert">${esc(error)}</div>` : ''}
    ${step2
      ? '<label for="code">6-digit code</label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus>'
      : `<label for="e">Email</label><input id="e" type="email" autocomplete="username" required autofocus>
         <label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required>`}
    <button class="b block" type="submit">${step2 ? 'Verify and sign in' : 'Sign in'}</button>
    ${step2 ? '<button class="b ghost block" type="button" id="back1">Back</button>' : ''}</form></div>`;
  if (step2) $('#back1').onclick = () => login();
  $('#lf').onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector('[type=submit]'); btn.disabled = true;
    try {
      if (step2) { await api('/login/2fa', { method: 'POST', body: { code: $('#code').value } }); return await boot(); }
      const r = await api('/login', { method: 'POST', body: { email: $('#e').value, password: $('#p').value } });
      if (r.need2fa) return login('', true);
      await boot();
    } catch (x) { login(x.message, step2 && !/timed out/.test(x.message)); }
  };
}

const RES_ICON = { programs: 'book', providers: 'building', posts: 'pen', team: 'card', forms: 'list', partners: 'link' };
function navGroups() {
  const admin = schema.user.admin, res = (k) => (schema.resources[k] ? [[k, schema.resources[k].label, RES_ICON[k] || 'list']] : []);
  return [
    ['', [['dashboard', 'Dashboard', 'grid']]],
    ['Clients', [['leads', 'Leads', 'inbox'], ...(admin ? [['referrals', 'Referrals', 'users'], ...res('partners')] : [])]],
    ...(admin ? [['Website', [...res('programs'), ...res('providers'), ...res('posts'), ...res('team'), ...res('forms'), ['settings', 'Site settings', 'sliders']]]] : []),
    ['Administration', [...(admin ? [['users', 'Team & security', 'shield']] : []), ['account', 'My account', 'user']]],
  ];
}
let dirty = false; // unsaved changes on the screen (Site settings)
const leave = () => !dirty || confirm('You have unsaved changes. Leave without saving?');
function shell(inner, { title = '', actions = '', sub = '' } = {}) {
  dirty = false;
  const u = schema.user;
  root.innerHTML = `<div class="app">
   <aside class="side" id="side"><div class="side-brand"><span class="mk">U</span><div><b>UGEC Canada</b><small>Admin panel</small></div></div>
    <nav aria-label="Admin sections">${navGroups().map(([g, items]) => `${g ? `<p class="nav-h">${esc(g)}</p>` : ''}${items.map(([k, l, ic]) => `<button data-tab="${k}"${k === tab ? ' aria-current="page"' : ''}>${icon(ic)}<span>${esc(l)}</span></button>`).join('')}`).join('')}</nav>
    <div class="side-foot"><div class="me"><span class="av">${esc(initials(u.name || u.email))}</span><div><b>${esc(u.name || u.email)}</b><small>${u.admin ? 'Admin' : 'Staff'}</small></div></div>
     <button id="view">${icon('ext')}<span>View website</span></button><button id="out">${icon('out')}<span>Sign out</span></button></div></aside>
   <div class="side-back" id="sideback"></div>
   <div class="main"><header class="top"><button class="menu" id="menu" aria-label="Menu" aria-controls="side" aria-expanded="false">${icon('menu')}</button>
    <div class="top-t"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="top-a">${actions}</div></header>
    <main class="content">${msg()}${inner}</main></div></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { if (!leave()) return; tab = b.dataset.tab; closeDrawer(); draw(); }));
  const side = $('#side'), menu = $('#menu'), toggle = (o) => { side.classList.toggle('open', o); menu.setAttribute('aria-expanded', String(o)); };
  menu.onclick = () => toggle(!side.classList.contains('open')); $('#sideback').onclick = () => toggle(false);
  $('#out').onclick = async () => { if (!leave()) return; await api('/logout', { method: 'POST' }); me = null; closeDrawer(); login(); };
  $('#view').onclick = () => window.open('/', '_blank');
}
async function boot() { schema = await api('/schema'); me = schema.user; if (!me.admin && !['dashboard', 'leads', 'account'].includes(tab)) tab = 'dashboard'; draw(); }
async function draw() {
  try {
    if (tab === 'dashboard') return await dashboard();
    if (tab === 'leads') return await leads();
    if (tab === 'referrals') return await referrals();
    if (tab === 'settings') return await settings();
    if (tab === 'users') return await users();
    if (tab === 'account') return await account();
    return await list(tab);
  } catch (x) { if (x.message !== 'Signed out') { say(x.message, 'err'); shell('<div class="card">Could not load this section. Try again in a moment.</div>', { title: 'Something went wrong' }); } }
}
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

const niceMax = (m) => { const p = 10 ** Math.floor(Math.log10(Math.max(1, m))); return [1, 2, 5, 10].map((k) => k * p).find((v) => v >= m); };
function weekChart(weeks) {
  const top = niceMax(Math.max(1, ...weeks.map((w) => w.count)));
  const label = (w) => `Week of ${day(w.start)}`;
  return `<div class="vchart"><div class="vgrid" aria-hidden="true">${[top, top / 2, 0].map((v) => `<span><i>${Number.isInteger(v) ? v : v.toFixed(1)}</i></span>`).join('')}</div>
    <div class="vbars" role="list" aria-label="Leads per week, last 12 weeks">${weeks.map((w) => `<div class="vb" role="listitem" tabindex="0" aria-label="${esc(label(w))}: ${plural(w.count, 'lead')}">
      <span class="vfill${w.count ? '' : ' zero'}" style="height:${(w.count / top) * 100}%"></span><span class="tip"><b>${plural(w.count, 'lead')}</b>${esc(label(w))}</span></div>`).join('')}</div>
    <div class="vlabels" aria-hidden="true">${weeks.map((w, i) => `<span>${i % 3 === 0 || i === weeks.length - 1 ? esc(day(w.start)) : ''}</span>`).join('')}</div></div>
    <details class="astable"><summary>Show as a table</summary><table><thead><tr><th>Week starting</th><th>Leads</th></tr></thead><tbody>${weeks.map((w) => `<tr><td>${esc(day(w.start))}</td><td>${w.count}</td></tr>`).join('')}</tbody></table></details>`;
}
function hbars(rows, empty) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  const top = Math.max(1, ...rows.map((r) => r.value));
  return `<ul class="hbars">${rows.map((r) => `<li><span class="hl">${esc(r.label)}</span><span class="ht"><span class="hf" style="width:${Math.max(2, (r.value / top) * 100)}%"></span></span><span class="hv">${r.value}</span></li>`).join('')}</ul>`;
}
async function dashboard() {
  const current = newScreen();
  const d = await api('/dashboard');
  if (!current()) return;
  const t = d.totals, u = schema.user, hour = new Date().getHours();
  const hello = `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}${u.name ? ', ' + esc(u.name.split(/\s+/)[0]) : ''}`;
  const rate = t.total90 ? Math.round((t.enrolled90 / t.total90) * 100) : 0;
  const tile = (n, l, sub, go, cls = '') => `<button class="stat ${cls}" data-go="${go}"><span class="stat-n">${n}</span><span class="stat-l">${l}</span><span class="stat-s">${sub}</span></button>`;
  const leadRow = (r, extra) => `<tr><td><button class="linkish" data-lead="${r.id}"><b>${esc(r.name || r.email || 'Lead #' + r.id)}</b></button></td>${extra(r)}</tr>`;
  const statusOrder = schema.leadStatuses.map((s) => ({ label: s, value: (d.byStatus.find((x) => x.status === s) || { c: 0 }).c }));
  shell(`${!u.totp_on ? `<div class="notice">${icon('shield')}<div><b>Protect your login with two-step sign-in.</b> The admin panel holds clients' personal details. It takes two minutes with a free app like Google Authenticator.</div><button class="b sm" data-goto="account">Set it up</button></div>` : ''}
    <div class="stats">
      ${tile(t.fresh, 'New leads', t.unassigned ? `${t.unassigned} not assigned yet` : 'All assigned', 'new', t.unassigned ? 'hot' : '')}
      ${tile(t.due, 'Follow-ups due', `${t.myDue} of them yours`, 'due', t.due ? 'warn' : '')}
      ${tile(t.week, 'Leads this week', 'Last 7 days', 'all')}
      ${tile(t.mine, 'Your open leads', 'Assigned to you', 'mine')}
      ${tile(rate + '%', 'Enrolled', `${t.enrolled90} of ${t.total90} leads, last 90 days`, 'enrolled')}
    </div>
    <div class="dgrid"><div class="dcol">
      <section class="card"><div class="card-h"><h2>Follow-ups due</h2><button class="b ghost sm" data-go="due">See all</button></div>
        ${d.followUps.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Lead</th><th>Due</th><th>Status</th><th>Assigned to</th></tr></thead><tbody>
        ${d.followUps.slice(0, 8).map((r) => leadRow(r, (x) => `<td>${followBadge(x.follow_up, d.today)}</td><td>${statusBadge(x.status)}</td><td>${x.assignee ? esc(x.assignee) : '<span class="muted">Nobody</span>'}</td>`)).join('')}</tbody></table></div>`
        : '<div class="empty">Nothing due. Set a follow-up date on a lead and it shows up here on that day.</div>'}</section>
      <section class="card"><div class="card-h"><h2>Leads per week</h2><span class="muted sm">Last 12 weeks</span></div>${weekChart(d.weeks)}</section>
      <section class="card"><div class="card-h"><h2>Where leads come from</h2><span class="muted sm">Last 90 days</span></div>${hbars(d.byForm.map((x) => ({ label: x.title, value: x.c })), 'No leads in the last 90 days.')}</section>
      </div><div class="dcol">
      <section class="card"><div class="card-h"><h2>Newest leads</h2><button class="b ghost sm" data-go="all">All leads</button></div>
        ${d.recent.length ? `<ul class="mini">${d.recent.map((r) => `<li><button class="linkish" data-lead="${r.id}"><b>${esc(r.name || r.email || 'Lead #' + r.id)}</b><small>${esc(r.form_type)} · ${esc(shortWhen(r.created_at))}</small></button>${statusBadge(r.status)}</li>`).join('')}</ul>` : '<div class="empty">No leads yet.</div>'}</section>
      <section class="card"><div class="card-h"><h2>Pipeline</h2><span class="muted sm">All leads by status</span></div>${hbars(statusOrder, 'No leads yet.')}</section>
      ${u.admin ? `<section class="card"><div class="card-h"><h2>Top referral partners</h2><span class="muted sm">Last 90 days</span></div>${hbars(d.byPartner.map((x) => ({ label: x.name, value: x.c })), 'No referred leads in the last 90 days.')}</section>` : ''}
    </div></div>`, { title: hello, sub: new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) });
  const VIEW = { new: { view: 'all', status: 'new' }, due: { view: 'due' }, all: { view: 'all' }, mine: { view: 'mine' }, enrolled: { view: 'all', status: 'enrolled' } };
  root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { lf = { ...LF0, ...VIEW[b.dataset.go] }; tab = 'leads'; draw(); }));
  root.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => { tab = b.dataset.goto; draw(); }));
  root.querySelectorAll('[data-lead]').forEach((b) => (b.onclick = () => openLead(Number(b.dataset.lead))));
}

const LF0 = { view: 'open', status: 'all', form: 'all', partner: 'all', assigned: 'all', q: '' };
let lf = { ...LF0 };
const VIEWS = [['open', 'Open'], ['mine', 'Assigned to me'], ['unassigned', 'Unassigned'], ['due', 'Follow-ups due'], ['all', 'All leads']];
const selected = new Set();
let assignees = null, formTitles = {};
const getAssignees = async () => (assignees ||= await api('/assignees'));
function leadParams() {
  const q = { status: lf.status, form: lf.form, partner: lf.partner, assigned: lf.assigned, q: lf.q };
  if (lf.view === 'open' && q.status === 'all') q.status = 'open';
  if (lf.view === 'mine') q.assigned = 'me';
  if (lf.view === 'unassigned') q.assigned = 'none';
  if (lf.view === 'due') q.due = '1';
  return new URLSearchParams(q).toString();
}
async function leads() {
  const current = newScreen();
  const [d, people] = await Promise.all([api('/leads?' + leadParams()), getAssignees()]);
  if (!current()) return;
  const admin = schema.user.admin;
  formTitles = Object.fromEntries(d.forms.map((f) => [f.type, f.title]));
  for (const id of [...selected]) if (!d.rows.some((r) => r.id === id)) selected.delete(id);
  const cnt = Object.fromEntries(d.counts.map((c) => [c.status, c.c]));
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  shell(`<div class="seg" role="tablist" aria-label="Which leads">${VIEWS.map(([k, l]) => `<button role="tab" aria-selected="${lf.view === k}" data-view="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="filters">
      <div class="search">${icon('inbox')}<input id="fq" type="search" placeholder="Search name, email, phone, program..." value="${esc(lf.q)}" aria-label="Search leads"></div>
      <select id="fs" aria-label="Status">${opt('all', 'Any status', lf.status)}${schema.leadStatuses.map((s) => opt(s, `${cap(s)} (${cnt[s] || 0})`, lf.status)).join('')}</select>
      <select id="ff" aria-label="Form">${opt('all', 'Any form', lf.form)}${d.forms.map((f) => opt(f.type, f.title, lf.form)).join('')}</select>
      ${lf.view === 'mine' || lf.view === 'unassigned' ? '' : `<select id="fa" aria-label="Assigned to">${opt('all', 'Anyone', lf.assigned)}${opt('none', 'Unassigned', lf.assigned)}${people.map((p) => opt(p.id, p.name, lf.assigned)).join('')}</select>`}
      ${admin ? `<select id="fp" aria-label="Referral partner">${opt('all', 'Any referral', lf.partner)}${opt('any', 'Referred by a partner', lf.partner)}${opt('none', 'No partner', lf.partner)}${d.partners.map((p) => opt(p.id, p.name, lf.partner)).join('')}</select>` : ''}
    </div>
    <div class="bulk" id="bulk" hidden><b id="bulkn"></b>
      <select data-bulk="status" aria-label="Set status for selected"><option value="">Set status...</option>${schema.leadStatuses.map((s) => `<option value="${esc(s)}">${esc(cap(s))}</option>`).join('')}</select>
      <select data-bulk="assign" aria-label="Assign selected"><option value="">Assign to...</option><option value="0">Nobody</option>${people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      <label class="inline">Follow-up <input type="date" data-bulk="follow" aria-label="Follow-up date for selected"></label>
      <button class="b ghost sm" id="bexport">${icon('download')}Export</button>
      ${admin ? '<button class="b ghost sm danger" id="bdel">Delete</button>' : ''}
      <button class="b ghost sm" id="bclear">Clear selection</button></div>
    ${d.rows.length ? `<div class="card flush"><div class="tw"><table class="tbl leads"><thead><tr><th class="chk"><input type="checkbox" id="selall" aria-label="Select all"></th><th>Lead</th><th>Form</th><th>Status</th><th>Assigned to</th><th>Follow-up</th><th>Received</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr data-row="${r.id}"${selected.has(r.id) ? ' class="sel"' : ''}><td class="chk"><input type="checkbox" data-sel="${r.id}"${selected.has(r.id) ? ' checked' : ''} aria-label="Select ${esc(r.name || r.email)}"></td>
        <td><button class="linkish" data-open="${r.id}"><b>${esc(r.name || r.email || 'Lead #' + r.id)}</b><small>${esc(r.email || r.phone || '')}</small></button>${r.dupes.length ? ` <span class="badge tag" title="Also sent ${plural(r.dupes.length, 'other request')}">Returning</span>` : ''}${r.paid ? ' <span class="badge st-enrolled">Paid</span>' : ''}</td>
        <td>${esc(formTitles[r.form_type] || r.form_type)}</td><td>${statusBadge(r.status)}</td>
        <td>${r.assignee ? esc(r.assignee) : '<span class="muted">Unassigned</span>'}</td><td>${followBadge(r.follow_up, d.today)}</td>
        <td class="nowrap muted">${esc(shortWhen(r.created_at))}</td></tr>`).join('')}</tbody></table></div>
      <p class="tfoot muted">${plural(d.rows.length, 'lead')}${d.rows.length === 500 ? ' (the newest 500; search or filter to find older ones)' : ''}</p></div>`
    : `<div class="card empty">${lf.view === 'due' ? 'No follow-ups are due. Nice work.' : 'No leads match these filters.'}</div>`}`,
  { title: 'Leads', actions: `<a class="b ghost" href="/admin/api/leads.csv?${leadParams()}">${icon('download')}Export CSV</a>` });

  const reload = () => { lf = { ...lf, status: $('#fs').value, form: $('#ff').value, assigned: $('#fa') ? $('#fa').value : lf.assigned, partner: $('#fp') ? $('#fp').value : 'all', q: $('#fq').value.trim() }; leads(); };
  ['#fs', '#ff', '#fa', '#fp'].forEach((s) => { if ($(s)) $(s).onchange = reload; });
  let typing; $('#fq').oninput = () => { clearTimeout(typing); typing = setTimeout(reload, 400); };
  root.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { lf = { ...LF0, view: b.dataset.view, q: lf.q }; leads(); }));
  root.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openLead(Number(b.dataset.open))));

  const sync = () => {
    $('#bulk').hidden = !selected.size; $('#bulkn').textContent = `${selected.size} selected`;
    if ($('#selall')) $('#selall').checked = selected.size > 0 && selected.size === d.rows.length;
    root.querySelectorAll('[data-row]').forEach((tr) => tr.classList.toggle('sel', selected.has(Number(tr.dataset.row))));
  };
  root.querySelectorAll('[data-sel]').forEach((c) => (c.onchange = () => { const id = Number(c.dataset.sel); c.checked ? selected.add(id) : selected.delete(id); sync(); }));
  if ($('#selall')) $('#selall').onchange = (e) => { d.rows.forEach((r) => (e.target.checked ? selected.add(r.id) : selected.delete(r.id))); root.querySelectorAll('[data-sel]').forEach((c) => (c.checked = e.target.checked)); sync(); };
  const bulk = async (action, value, label) => {
    try { const r = await api('/leads/bulk', { method: 'POST', body: { ids: [...selected], action, value } }); selected.clear(); say(`${plural(r.count, 'lead')} ${label}.`); }
    catch (x) { say(x.message, 'err'); }
    leads();
  };
  root.querySelectorAll('[data-bulk]').forEach((el) => (el.onchange = () => {
    if (el.value === '' && el.dataset.bulk !== 'follow') return;
    const name = el.selectedOptions ? el.selectedOptions[0].textContent : day(el.value);
    bulk(el.dataset.bulk, el.value, el.dataset.bulk === 'status' ? `set to "${name}"` : el.dataset.bulk === 'assign' ? (el.value === '0' ? 'unassigned' : `assigned to ${name}`) : `given a follow-up on ${name}`);
  }));
  $('#bexport').onclick = () => { location.href = `/admin/api/leads.csv?ids=${[...selected].join(',')}`; };
  if ($('#bdel')) $('#bdel').onclick = () => { if (confirm(`Delete ${plural(selected.size, 'lead')} permanently? This cannot be undone.`)) bulk('delete', null, 'deleted'); };
  $('#bclear').onclick = () => { selected.clear(); root.querySelectorAll('[data-sel]').forEach((c) => (c.checked = false)); sync(); };
  sync();
}

const METHOD = { link: "arrived through the partner's link", selected: 'chosen by the client from the list', typed: 'typed by the client (not matched)' };
const EVENT_ICON = { note: 'pen', status: 'sliders', assign: 'user', follow: 'grid', paid: 'card', contact: 'chat', partner: 'link', commission: 'card' };
let drawerFor = null;
function closeDrawer() {
  const d = $('#drawer'); if (d) d.remove();
  drawerFor = null; document.body.classList.remove('noscroll');
}
const waNumber = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '1' + d : d; };
async function openLead(id) {
  let r, events, people;
  try { [r, events, people] = await Promise.all([api('/leads/' + id), api(`/leads/${id}/events`), getAssignees()]); }
  catch (x) { say(x.message, 'err'); return draw(); }
  const admin = schema.user.admin, today = new Date().toISOString().slice(0, 10), u = schema.user;
  const partners = admin ? await api('/partners').catch(() => []) : [];
  const title = r.name || r.email || 'Lead #' + r.id, form = formTitles[r.form_type] || r.form_type;
  const first = String(r.name || '').trim().split(/\s+/)[0];
  const waText = `Hi ${first || 'there'}, this is ${u.name ? u.name.split(/\s+/)[0] + ' from ' : ''}UGEC Canada, about your request on our website (${form}).`;
  const contact = [
    r.phone && `<a class="b wa" data-via="whatsapp" target="_blank" rel="noopener" href="https://wa.me/${waNumber(r.phone)}?text=${encodeURIComponent(waText)}">${icon('chat')}WhatsApp</a>`,
    r.email && `<a class="b ghost" data-via="email" href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Your request with UGEC Canada')}">${icon('mail')}Email</a>`,
    r.phone && `<a class="b ghost" data-via="call" href="tel:+${waNumber(r.phone)}">${icon('phone')}Call</a>`,
  ].filter(Boolean).join('');
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  const history = [
    ...events.map((e) => `<li class="ev-${esc(e.kind)}"><span class="ev-ic">${icon(EVENT_ICON[e.kind] || 'pen')}</span><div><p>${esc(e.text)}</p><small>${esc(e.user_email)} · ${esc(when(e.created_at))}</small></div></li>`),
    r.notes ? `<li class="ev-note"><span class="ev-ic">${icon('pen')}</span><div><p>${esc(r.notes)}</p><small>Earlier notes</small></div></li>` : '',
    `<li><span class="ev-ic">${icon('inbox')}</span><div><p>Sent the ${esc(form)} form${r.partner_name ? `, referred by ${esc(r.partner_name)}` : ''}</p><small>${esc(when(r.created_at))}</small></div></li>`,
  ].join('');
  closeDrawer();
  const wrap = document.createElement('div');
  wrap.id = 'drawer';
  wrap.innerHTML = `<div class="drawer-back" data-close></div>
   <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dtitle">
    <header class="dh"><div><h2 id="dtitle">${esc(title)}</h2><p>${esc(form)} · received ${esc(when(r.created_at))} · #${r.id}</p></div><button class="b ghost icon-only" data-close aria-label="Close">${icon('x')}</button></header>
    <div class="db">
     ${r.dupes.length ? `<div class="notice sm">${icon('users')}<div>This person has sent ${plural(r.dupes.length, 'other request')}: ${r.dupes.map((x) => `<button class="linkish inline" data-lead="${x}">#${x}</button>`).join(', ')}</div></div>` : ''}
     ${contact ? `<div class="contact">${contact}</div>` : ''}
     <section class="dsec"><h3>Progress</h3><form id="lform"><div class="g2">
       <div><label for="l_st">Status</label><select id="l_st" name="status">${schema.leadStatuses.map((s) => opt(s, cap(s), r.status)).join('')}</select></div>
       <div><label for="l_as">Assigned to</label><select id="l_as" name="assigned_to">${opt('', 'Nobody', r.assigned_to)}${people.map((p) => opt(p.id, p.name, r.assigned_to)).join('')}</select></div>
       <div class="span2"><label for="l_fu">Follow-up date</label><div class="fu"><input type="date" id="l_fu" name="follow_up" value="${esc(r.follow_up)}">
         <span class="quick">${[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([l, n]) => `<button type="button" class="chip" data-fu="${addDays(today, n)}">${l}</button>`).join('')}<button type="button" class="chip" data-fu="">Clear</button></span></div>
         <p class="hint">It shows on the Dashboard on that day${r.assigned_to ? ', and in the morning email to whoever it is assigned to' : ''}.</p></div>
       <div class="span2"><label class="check"><input type="checkbox" name="paid"${r.paid ? ' checked' : ''}> Paid for a consultation <span class="muted">(check in Stripe first)</span></label></div>
       ${admin ? `<div><label for="l_rp">Referred by</label><select id="l_rp" name="referral_partner_id">${opt('', 'No partner', r.referral_partner_id)}${partners.map((p) => opt(p.id, p.name, r.referral_partner_id)).join('')}</select>
         <p class="hint">${r.referral_method ? esc(METHOD[r.referral_method] || '') : 'The client did not name a referrer.'}${r.referral_other ? ` Typed: "${esc(r.referral_other)}".` : ''}</p></div>
       <div><label for="l_cs">Commission (CAD)</label><div class="g2 tight"><select id="l_cs" name="commission_status">${schema.commissionStatuses.map((s) => opt(s, cap(s), r.commission_status)).join('')}</select>
         <input type="number" min="0" step="0.01" name="commission_amount" value="${esc(r.commission_amount)}" aria-label="Commission amount in CAD"></div></div>` : ''}
       </div><div class="row-end"><button class="b" type="submit">Save changes</button></div></form></section>
     <section class="dsec"><h3>Details from the form</h3><dl class="kv">${Object.entries(r.data).map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(v)}</dd>`).join('') || '<dd class="muted">No details.</dd>'}</dl></section>
     <section class="dsec"><h3>Notes & history</h3>
       <form id="nform" class="note-form"><textarea id="ntext" rows="2" placeholder="Add a note, e.g. called, left a voicemail, sent the program list"></textarea><button class="b sm" type="submit">Add note</button></form>
       <ol class="timeline">${history}</ol></section>
     ${admin ? `<div class="row-end"><button class="b ghost sm danger" id="ldel">Delete this lead</button></div>` : ''}
    </div></aside>`;
  document.body.append(wrap); document.body.classList.add('noscroll');
  drawerFor = id;
  const D = (s) => wrap.querySelector(s);
  wrap.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeDrawer));
  D('[aria-label="Close"]').focus();
  wrap.querySelectorAll('[data-lead]').forEach((b) => (b.onclick = () => openLead(Number(b.dataset.lead))));
  wrap.querySelectorAll('[data-fu]').forEach((b) => (b.onclick = () => { D('#l_fu').value = b.dataset.fu; }));
  wrap.querySelectorAll('[data-via]').forEach((a) => a.addEventListener('click', () => { api(`/leads/${id}/contact`, { method: 'POST', body: { via: a.dataset.via } }).catch(() => {}); }));
  const refresh = async (m) => { say(m); if (tab === 'leads') await leads(); else if (tab === 'dashboard') await dashboard(); openLead(id); };
  D('#lform').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target, body = { status: f.status.value, assigned_to: f.assigned_to.value, follow_up: f.follow_up.value, paid: f.paid.checked };
    if (admin) Object.assign(body, { referral_partner_id: f.referral_partner_id.value, commission_status: f.commission_status.value, commission_amount: f.commission_amount.value });
    try { await api('/leads/' + id, { method: 'PATCH', body }); await refresh('Lead saved.'); } catch (x) { alert(x.message); }
  };
  D('#nform').onsubmit = async (ev) => {
    ev.preventDefault();
    const text = D('#ntext').value.trim(); if (!text) return D('#ntext').focus();
    try { await api(`/leads/${id}/events`, { method: 'POST', body: { text } }); openLead(id); } catch (x) { alert(x.message); }
  };
  if (D('#ldel')) D('#ldel').onclick = async () => {
    if (!confirm(`Delete the lead from ${title} permanently? This cannot be undone.`)) return;
    try { await api('/leads/' + id, { method: 'DELETE' }); closeDrawer(); say('Lead deleted.'); draw(); } catch (x) { alert(x.message); }
  };
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerFor && !document.querySelector('dialog[open]')) closeDrawer(); });

const keyName = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
const SOURCES = [['', 'Choices I type below'], ['@programs', 'All programs (except skilled trades)'], ['@trades', 'Skilled-trades programs']];
function mountList(box, f) {
  const hidden = box.querySelector('input[type=hidden]'), wrap = box.querySelector('.le-items'), isMap = f.t === 'map';
  let items = [];
  try { const d = JSON.parse(hidden.value || (isMap ? '{}' : '[]')); items = isMap ? Object.entries(d).map(([k, v]) => ({ k, v })) : Array.isArray(d) ? d : []; } catch { /* start empty */ }
  const boxes = isMap ? [{ n: 'k', l: f.keyLabel, t: 'text', list: 'dl_' + f.n }, { n: 'v', l: f.valueLabel, t: 'textarea', rows: 2 }] : f.item;
  const sync = () => {
    hidden.value = JSON.stringify(isMap
      ? Object.fromEntries(items.filter((i) => String(i.k || '').trim()).map((i) => [i.k.trim(), i.v || '']))
      : items.map(({ _new, ...rest }) => rest));
  };
  const titleOf = (it, i) => (isMap ? it.k : it[f.titleFrom]) || `${f.add ? f.add.replace(/^Add an? /, '') : 'Item'} ${i + 1}`;
  const box1 = (b, it, i) => {
    const id = `le_${f.n}_${i}_${b.n}`, at = `data-i="${i}" data-k="${b.n}"`, v = it[b.n];
    if (b.t === 'checkbox') return `<div class="chk"><input type="checkbox" id="${id}" ${at}${v ? ' checked' : ''}><label for="${id}" style="margin:0">${esc(b.l)}</label></div>`;
    let c;
    if (b.t === 'textarea') c = `<textarea id="${id}" ${at} rows="${b.rows || 3}">${esc(v)}</textarea>`;
    else if (b.t === 'select') c = `<select id="${id}" ${at}>${b.o.map(([val, lab]) => `<option value="${esc(val)}"${(v || b.o[0][0]) === val ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
    else if (b.t === 'choices') {
      const src = typeof v === 'string' ? v : '';
      c = `<select id="${id}" ${at} data-role="src">${SOURCES.map(([val, lab]) => `<option value="${val}"${src === val ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>` +
        (src ? '' : `<textarea ${at} data-role="lines" rows="4" placeholder="One choice per line" aria-label="Choices, one per line">${esc((Array.isArray(v) ? v : []).join('\n'))}</textarea><p class="hint">One choice per line.</p>`);
    } else c = `<input id="${id}" ${at} value="${esc(v)}"${b.list ? ` list="${b.list}"` : ''}>`;
    return `<div${b.small ? ' class="le-small"' : ''}><label for="${id}">${esc(b.l)}</label>${c}</div>`;
  };
  const draw = (focusLast) => {
    wrap.innerHTML = items.length ? items.map((it, i) => `<div class="le-item">
      <div class="le-head"><strong data-title="${i}">${esc(titleOf(it, i))}</strong><span class="le-tools">
        <button type="button" class="b line sm" data-move="${i},-1"${i === 0 ? ' disabled' : ''} aria-label="Move up" title="Move up">&uarr;</button>
        <button type="button" class="b line sm" data-move="${i},1"${i === items.length - 1 ? ' disabled' : ''} aria-label="Move down" title="Move down">&darr;</button>
        <button type="button" class="b line sm danger" data-rm="${i}">Remove</button></span></div>
      ${boxes.filter((b) => !b.showIf || (it[b.showIf[0]] || '') === b.showIf[1]).map((b) => box1(b, it, i)).join('')}</div>`).join('')
      : '<p class="hint">Nothing here yet.</p>';
    if (focusLast) { const all = wrap.querySelectorAll('.le-item'); const el = all[all.length - 1]?.querySelector('input:not([type=checkbox]),textarea'); if (el) el.focus(); }
  };
  const edit = (e) => {
    const el = e.target.closest('[data-k]'); if (!el) return;
    const i = Number(el.dataset.i), k = el.dataset.k, it = items[i];
    if (el.type === 'checkbox') it[k] = el.checked ? 1 : 0;
    else if (el.dataset.role === 'src') { it[k] = el.value || (Array.isArray(it[k]) ? it[k] : []); sync(); return draw(); }
    else if (el.dataset.role === 'lines') it[k] = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    else it[k] = el.value;
    if (it._new && k === 'l' && boxes.some((b) => b.n === 'n')) { it.n = keyName(el.value); const n = wrap.querySelector(`[data-i="${i}"][data-k="n"]`); if (n) n.value = it.n; }
    const head = wrap.querySelector(`[data-title="${i}"]`); if (head) head.textContent = titleOf(it, i);
    sync();
    if (e.type === 'change' && boxes.some((b) => b.showIf && b.showIf[0] === k)) draw(); // e.g. type changed to Dropdown list
  };
  wrap.addEventListener('input', edit);
  wrap.addEventListener('change', edit);
  wrap.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-move]'), rm = e.target.closest('[data-rm]');
    if (mv) { const [i, d] = mv.dataset.move.split(',').map(Number); [items[i], items[i + d]] = [items[i + d], items[i]]; sync(); draw(); }
    if (rm) { const i = Number(rm.dataset.rm); if (!confirm(`Remove "${titleOf(items[i], i)}"?`)) return; items.splice(i, 1); sync(); draw(); }
  });
  box.querySelector('[data-le-add]').onclick = () => { items.push(isMap ? { k: '', v: '' } : boxes.some((b) => b.n === 't') ? { t: 'text', _new: true } : { _new: true }); sync(); draw(true); };
  if (f.suggest) api('/programs').then((rows) => box.insertAdjacentHTML('beforeend', `<datalist id="dl_${f.n}">${[...new Set(rows.map((r) => r[f.suggest]).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`)).catch(() => {});
  draw();
}
function mountRanges(form) {
  form.querySelectorAll('.range-field input[type=range]').forEach((r) => {
    const out = r.parentElement.querySelector('output');
    const prev = form.querySelector(`.logo-preview[data-for="${r.id}"]`);
    const draw = () => {
      out.textContent = `${r.value} ${r.dataset.unit}`;
      if (!prev) return;
      const src = (form.elements[prev.dataset.preview] || {}).value;
      prev.querySelector('.lp-logo').innerHTML = src
        ? `<img src="${esc(src)}" alt="" style="height:${Number(r.value)}px">`
        : `<span class="lp-mark" style="font-size:${Number(r.value) / 44}rem">UGEC <small>Canada</small></span><span class="hint">(upload a logo to see it here)</span>`;
    };
    r.addEventListener('input', draw);
    form.addEventListener('change', (e) => { if (e.target.name === prev?.dataset.preview) draw(); });
    draw();
  });
}
const mountLists = (defs) => root.querySelectorAll('.le').forEach((box) => mountList(box, defs.find((f) => f.n === box.dataset.le)));

async function referrals(invite = null) {
  const current = newScreen();
  const d = await api('/referrals/summary');
  if (!current()) return;
  const base = d.siteUrl || location.origin;
  const link = (code) => `${base}/?ref=${code}`;
  const tot = d.partners.reduce((a, p) => ({ pending: a.pending + p.pending, approved: a.approved + p.approved, paid: a.paid + p.paid, total: a.total + p.total }), { pending: 0, approved: 0, paid: 0, total: 0 });
  shell(`<p class="lede">Clients pick who referred them on the website forms, or arrive through a partner's link. Open a lead to confirm the referral and set the commission (in CAD).</p>
   ${invite ? `<div class="card invite" role="status"><h2>Sign-in invite for ${esc(invite.name)}</h2>
     <p>${invite.emailed ? `Emailed to <strong>${esc(invite.email)}</strong>. You can also send this link yourself (for example on WhatsApp):` : `Email is not set up, so send this link to ${esc(invite.name)} yourself (for example on WhatsApp or by email to ${esc(invite.email)}):`}</p>
     <div class="bar"><input class="grow" readonly value="${esc(invite.link)}" aria-label="Invite link"><button class="b" data-copy="${esc(invite.link)}">Copy link</button></div>
     <p class="hint">The link works for 7 days and only once. They choose their password, then sign in with ${esc(invite.email)}.</p></div>` : ''}
   <div class="stats">
     <div class="stat static"><span class="stat-n">${tot.total}</span><span class="stat-l">Referred leads</span></div>
     <div class="stat static"><span class="stat-n">${money(tot.pending)}</span><span class="stat-l">Pending</span></div>
     <div class="stat static"><span class="stat-n">${money(tot.approved)}</span><span class="stat-l">Approved, not paid</span></div>
     <div class="stat static"><span class="stat-n">${money(tot.paid)}</span><span class="stat-l">Paid</span></div>
   </div>
   <div class="card flush"><div class="tw"><table class="tbl"><thead><tr><th>Partner</th><th>Referral link</th><th>Portal sign-in</th><th>Leads</th><th>Booked</th><th>Applied</th><th>Enrolled</th><th>Pending</th><th>Approved</th><th>Paid</th><th></th></tr></thead><tbody>
   ${d.partners.map((p) => `<tr><td><b>${esc(p.name)}</b>${p.active ? '' : ' <span class="badge">inactive</span>'}${p.listed ? '' : ' <span class="badge">link only</span>'}<br><span class="muted sm">${esc(p.code)}</span></td>
    <td><button class="b ghost sm" data-copy="${esc(link(p.code))}">Copy link</button></td>
    <td>${portalStatus(p)}<br><button class="b ghost sm mt-xs" data-invite="${p.id}"${p.email && p.portal_enabled ? '' : ' disabled'} title="${p.email ? (p.portal_enabled ? 'Send a link to choose a password' : 'Portal sign-in is turned off for this partner') : 'Add an email address first'}">${p.has_password ? 'Send password reset' : 'Send sign-in invite'}</button></td><td>${p.total}</td><td>${p.booked}</td><td>${p.applied}</td><td>${p.enrolled}</td><td>${money(p.pending)}</td><td>${money(p.approved)}</td><td>${money(p.paid)}</td>
    <td><button class="b ghost sm" data-leads="${p.id}">View leads</button></td></tr>`).join('') || '<tr><td colspan="11" class="empty">No partners yet. Add one to start tracking referrals.</td></tr>'}</tbody></table></div></div>
   <p class="muted">Leads with no partner: ${d.unattributed}${d.other ? `, including ${d.other} where the client typed a name that did not match a partner` : ''}. <button class="b ghost sm" id="unm">Review them</button></p>
   <details class="help"><summary>How the referral partner portal works</summary><p>Partners can sign in to their own <a href="/referral-portal" target="_blank" rel="noopener">referral partner portal</a> (separate from this admin panel) to follow their referrals: first name and last initial, what they asked about, progress and commission, never contact details. To give a partner access, add their email in Referral partners, then click <strong>Send sign-in invite</strong>: they get a link to choose their own password. Use it again if they forget their password.</p></details>`,
  { title: 'Referrals', actions: `<button class="b" id="addp">${icon('plus')}Add partner</button>` });
  $('#addp').onclick = () => { tab = 'partners'; draw(); };
  $('#unm').onclick = () => { lf = { ...LF0, view: 'all', partner: 'none' }; tab = 'leads'; draw(); };
  root.querySelectorAll('[data-leads]').forEach((b) => (b.onclick = () => { lf = { ...LF0, view: 'all', partner: b.dataset.leads }; tab = 'leads'; draw(); }));
  root.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch { prompt('Copy this link:', b.dataset.copy); } }));
  root.querySelectorAll('[data-invite]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { const r = await api(`/partners/${b.dataset.invite}/invite`, { method: 'POST' }); referrals({ ...r, name: d.partners.find((p) => String(p.id) === b.dataset.invite).name }); window.scrollTo(0, 0); }
    catch (x) { say(x.message, 'err'); referrals(); }
  }));
}
function portalStatus(p) {
  if (!p.portal_enabled) return '<span class="badge">sign-in off</span>';
  if (!p.email) return '<span class="muted sm">needs an email</span>';
  if (p.has_password) return `<span class="badge st-enrolled">can sign in</span><br><span class="muted sm">last: ${esc(when(p.last_login))}</span>`;
  return p.invited ? '<span class="badge">invited</span>' : '<span class="muted sm">not invited yet</span>';
}

function input(f, v, opts = {}) {
  const id = 'f_' + f.n, name = `name="${f.n}"`, hint = f.h ? `<p class="hint">${esc(f.h)}</p>` : '';
  const field = (control, cls = '') => `<div class="field ${cls}"><div class="fl"><label for="${id}">${esc(f.l)}${f.r ? ' <span class="req">*</span>' : ''}</label>${hint}</div><div class="fc">${control}</div></div>`;
  if (f.t === 'heading') return `<h2 class="sec-h">${esc(f.l)}</h2>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}`;
  if (f.t === 'subheading') return `<h3 class="subh">${esc(f.l)}</h3>`;
  if (f.t === 'range') {
    const val = v || f.def;
    return field(`<div class="range-field"><input type="range" id="${id}" ${name} min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${esc(val)}" data-unit="${esc(f.unit || '')}"><output for="${id}">${esc(val)} ${esc(f.unit || '')}</output></div>` +
      (f.preview ? `<div class="logo-preview" data-preview="${esc(f.preview)}" data-for="${id}"><div class="lp-bar"><span class="lp-logo"></span><span class="lp-nav"><i>Home</i><i>Already in Canada</i><i>Contact Us</i><b>Book Consultation</b></span></div>
        <p class="hint">How the header will look. Phones show the logo slightly smaller.</p></div>` : ''));
  }
  if (f.t === 'list' || f.t === 'map') return `<div class="field wide"><div class="fl"><label>${esc(f.l)}</label>${hint}</div><div class="fc"><div class="le" data-le="${esc(f.n)}"><input type="hidden" ${name} value="${esc(v)}">
    <div class="le-items"></div><button type="button" class="b ghost sm" data-le-add>${icon('plus')}${esc(f.add || 'Add')}</button></div></div></div>`;
  if (f.t === 'checkbox') return `<div class="field"><div class="fl"></div><div class="fc"><label class="check"><input type="checkbox" id="${id}" ${name}${v ? ' checked' : ''}> ${esc(f.l)}</label>${hint}</div></div>`;
  if (f.t === 'image') {
    const shapes = (f.shapes || ['free']).filter((k) => SHAPES[k]), square = SHAPES[shapes[0]].ratio === 1;
    return `<div class="field"><div class="fl"><label>${esc(f.l)}</label>${hint}</div><div class="fc"><div class="img-field" data-folder="${esc(f.folder)}" data-shapes="${esc(shapes.join(','))}" data-max="${esc(f.max || '')}" data-format="${esc(f.format || '')}">
    <div class="img-prev${square ? '' : ' wide'}">${v ? `<img src="${esc(v)}" alt="">` : '<span>None</span>'}</div>
    <div><input type="hidden" ${name} value="${esc(v)}"><input type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="${esc(f.l)}">
      <div class="bar"><button type="button" class="b ghost sm" data-pick>${v ? 'Change' : 'Upload'}</button><button type="button" class="b ghost sm" data-adjust${v ? '' : ' hidden'}>Adjust</button><button type="button" class="b ghost sm danger" data-clear${v ? '' : ' hidden'}>Remove</button></div>
      <p class="hint">JPG, PNG or WebP. You can move, zoom and crop it${shapes.length > 1 ? ` (shapes: ${shapes.map((k) => SHAPES[k].label.toLowerCase()).join(', ')})` : ''}.</p></div></div></div></div>`;
  }
  let c;
  if (f.t === 'textarea') c = `<textarea id="${id}" ${name} rows="${f.rows || 4}">${esc(v)}</textarea>`;
  else if (f.t === 'lines') c = `<textarea id="${id}" ${name} rows="${Math.max(3, String(v || '').split('\n').length + 1)}" class="lines">${esc(v)}</textarea>`;
  else if (f.t === 'json') c = `<textarea id="${id}" ${name} class="json" rows="${f.rows || 10}" spellcheck="false">${esc(v)}</textarea>`;
  else if (f.t === 'select') c = `<select id="${id}" ${name}>${f.o.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(v ?? f.o[0][0] ?? f.o[0]) === val ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else if (f.t === 'ref') c = `<select id="${id}" ${name}><option value="">None</option>${(opts.refs[f.ref] || []).map((o) => `<option value="${o.id}"${String(v) === String(o.id) ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
  else {
    const dl = f.suggest ? ` list="dl_${f.n}"` : '';
    c = `<input id="${id}" ${name} type="${f.t === 'number' ? 'number' : f.t === 'date' ? 'date' : 'text'}" value="${esc(v)}"${f.r ? ' required' : ''}${dl}>` +
      (f.suggest ? `<datalist id="dl_${f.n}">${[...new Set((opts.rows || []).map((r) => r[f.n]).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : '');
  }
  return field(c, f.t === 'textarea' || f.t === 'lines' || f.t === 'json' ? 'tall' : '');
}
function collect(form, def) {
  const o = {};
  for (const f of def.fields) {
    const el = f.n && form.elements[f.n]; if (!el) continue;
    o[f.n] = f.t === 'checkbox' ? el.checked : el.value;
  }
  return o;
}
function trackChanges(form) {
  const bar = form.querySelector('.savebar');
  const mark = () => { dirty = true; bar.classList.add('dirty'); bar.querySelector('.state').textContent = 'You have unsaved changes'; };
  form.addEventListener('input', mark); form.addEventListener('change', mark);
}

async function list(key) {
  const def = schema.resources[key];
  const current = newScreen();
  const rows = await api('/' + key);
  if (!current()) return;
  const col = (r, c) => {
    const f = def.fields.find((x) => x.n === c); const v = r[c];
    if (f && f.t === 'image') return v ? `<img class="thumb" src="${esc(v)}" alt="">` : '<span class="thumb none" aria-label="No photo"></span>';
    return f && f.t === 'checkbox' ? (v ? '<span class="badge st-enrolled">Yes</span>' : '<span class="badge">No</span>') : esc(v);
  };
  shell(`<div class="card flush"><div class="tw"><table class="tbl"><thead><tr>${def.list.map((c) => `<th>${esc((def.fields.find((f) => f.n === c) || { l: c }).l)}</th>`).join('')}<th></th></tr></thead><tbody>
   ${rows.map((r) => `<tr>${def.list.map((c) => `<td>${col(r, c)}</td>`).join('')}<td class="row-end"><button class="b ghost sm" data-edit="${esc(r[def.id])}">Edit</button></td></tr>`).join('') || `<tr><td colspan="${def.list.length + 1}" class="empty">Nothing here yet.</td></tr>`}</tbody></table></div></div>`,
  { title: def.label, sub: plural(rows.length, 'item'), actions: `<button class="b" id="new">${icon('plus')}Add new</button>` });
  $('#new').onclick = () => editor(key, null, rows);
  root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editor(key, rows.find((r) => String(r[def.id]) === b.dataset.edit), rows)));
}
async function editor(key, row, rows) {
  const def = schema.resources[key];
  const refs = {}, current = newScreen();
  for (const f of def.fields) if (f.t === 'ref' && !refs[f.ref]) refs[f.ref] = await api('/' + f.ref);
  if (!current()) return;
  const isNew = !row;
  const defaults = isNew ? { published: 1, visible: 1, enabled: 1, listed: 1, active: 1, portal_enabled: 1, sort: 0, published_at: new Date().toISOString().slice(0, 10) } : row;
  const label = def.label.replace(/s$/, '').replace(/ies$/, 'y');
  shell(`<form id="ef" class="card form">${def.fields.map((f) => (f.n === def.id && !isNew && !def.idEditable ? '' : input(f, defaults[f.n], { refs, rows }))).join('')}
   <div class="savebar"><span class="state">${isNew ? 'Not saved yet' : 'No changes'}</span>${isNew ? '' : '<button class="b ghost danger" type="button" id="rm">Delete</button>'}<button class="b" type="submit">Save</button></div></form>`,
  { title: isNew ? `Add ${def.label.toLowerCase()}` : (row.name || row.title || `Edit ${label.toLowerCase()}`), sub: def.label, actions: '<button class="b ghost" id="back">Back to list</button>' });
  $('#back').onclick = () => { if (leave()) draw(); };
  root.querySelectorAll('.img-field').forEach((box) => imageField(box, $('#ef')));
  mountLists(def.fields);
  trackChanges($('#ef'));
  $('#ef').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api(isNew ? '/' + key : `/${key}/${encodeURIComponent(row[def.id])}`, { method: isNew ? 'POST' : 'PUT', body: collect(ev.target, def) });
      dirty = false; say('Saved.'); draw();
    } catch (x) { const m = document.createElement('div'); m.className = 'msg err'; m.setAttribute('role', 'alert'); m.textContent = x.message; $('#ef').prepend(m); m.scrollIntoView({ block: 'center' }); }
  };
  if (!isNew) $('#rm').onclick = async () => {
    if (!confirm('Delete this item permanently?')) return;
    try { await api(`/${key}/${encodeURIComponent(row[def.id])}`, { method: 'DELETE' }); dirty = false; say('Deleted.'); draw(); } catch (x) { say(x.message, 'err'); draw(); }
  };
}

let settingsTab = 0;
async function settings() {
  const current = newScreen();
  const [s, mail] = await Promise.all([api('/settings'), api('/email')]);
  if (!current()) return;
  const groups = [];
  for (const f of schema.settingsFields) { if (f.t === 'heading') groups.push({ h: f, fields: [] }); else if (groups.length) groups[groups.length - 1].fields.push(f); }
  if (settingsTab >= groups.length) settingsTab = 0;
  const emailCard = `<div class="callout ${mail.enabled ? 'ok' : 'warn'}"><div><b>${mail.enabled ? 'Email is working' : 'Email is not set up'}</b>
    <p>${mail.enabled ? `New leads are emailed to the team${mail.mode === 'gateway' ? ' through GoDaddy\'s email service' : ''}${s.confirm_email !== '0' ? ', and people who send a form get a confirmation' : ''}.` : 'New leads only appear in Leads; nobody is emailed. On GoDaddy this works automatically; on your own computer add the SMTP settings to .env.'}</p></div>
    ${mail.enabled ? '<div class="callout-a"><button class="b ghost sm" type="button" id="testmail">Send a test email to me</button><span class="hint" id="testmsg" role="status"></span></div>' : ''}</div>`;
  shell(`<div class="settings">
    <nav class="stabs" role="tablist" aria-label="Settings sections">${groups.map((g, i) => `<button type="button" role="tab" id="st${i}" aria-controls="sp${i}" aria-selected="${i === settingsTab}" data-stab="${i}">${esc(g.h.l)}</button>`).join('')}</nav>
    <form id="sf" class="card form">${groups.map((g, i) => `<section id="sp${i}" role="tabpanel" aria-labelledby="st${i}"${i === settingsTab ? '' : ' hidden'}>
      <div class="sec-intro"><h2>${esc(g.h.l)}</h2>${g.h.hint ? `<p>${esc(g.h.hint)}</p>` : ''}</div>
      ${/email/i.test(g.h.l) ? emailCard : ''}${g.fields.map((f) => input(f, f.t === 'checkbox' ? s[f.n] === '1' : s[f.n])).join('')}</section>`).join('')}
      <div class="savebar"><span class="state">All changes saved</span><button class="b" type="submit">Save changes</button></div></form></div>`,
  { title: 'Site settings', sub: 'Changes show on the website as soon as you save.' });
  root.querySelectorAll('[data-stab]').forEach((b) => (b.onclick = () => {
    settingsTab = Number(b.dataset.stab);
    root.querySelectorAll('[data-stab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    root.querySelectorAll('[role=tabpanel]').forEach((p, i) => { p.hidden = i !== settingsTab; });
  }));
  root.querySelectorAll('.img-field').forEach((box) => imageField(box, $('#sf')));
  mountLists(schema.settingsFields);
  mountRanges($('#sf'));
  trackChanges($('#sf'));
  if ($('#testmail')) $('#testmail').onclick = async () => {
    $('#testmsg').textContent = 'Sending...';
    try { const r = await api('/email/test', { method: 'POST' }); $('#testmsg').textContent = `Sent to ${r.to}. Check that inbox (and spam).`; }
    catch (x) { $('#testmsg').textContent = x.message; }
  };
  $('#sf').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/settings', { method: 'PUT', body: collect(ev.target, { fields: schema.settingsFields }) }); dirty = false; say('Settings saved. The website shows the changes now.'); settings(); }
    catch (x) { say(x.message, 'err'); dirty = false; settings(); }
  };
}

const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
function suggestPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint32Array(16))].map((n) => abc[n % abc.length]).join('');
}
async function users() {
  const current = newScreen();
  const [u, act, bk] = await Promise.all([api('/users'), api('/activity'), api('/backup')]);
  if (!current()) return;
  const off = u.users.filter((x) => !x.totp_on).length;
  shell(`<section class="card"><div class="card-h"><h2>Logins</h2><span class="muted sm">${u.users.length === 1 ? '1 person' : u.users.length + ' people'}${off ? ` · ${off} without two-step sign-in` : ''}</span></div>
    <div class="tw"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th>Two-step sign-in</th><th>Last sign-in</th><th></th></tr></thead><tbody>
    ${u.users.map((x) => `<tr><td><div class="who"><span class="av sm">${esc(initials(x.name || x.email))}</span><div><b>${esc(x.name || x.email)}</b>${x.id === u.me ? ' <span class="badge">you</span>' : ''}${x.name ? `<br><span class="muted sm">${esc(x.email)}</span>` : ''}</div></div></td>
     <td>${x.id === u.me ? `<span class="badge">${x.role === 'staff' ? 'Staff' : 'Admin'}</span>` : `<select data-role="${x.id}" aria-label="Role for ${esc(x.email)}"><option value="admin"${x.role !== 'staff' ? ' selected' : ''}>Admin</option><option value="staff"${x.role === 'staff' ? ' selected' : ''}>Staff</option></select>`}</td>
     <td>${x.totp_on ? `<span class="badge st-enrolled">On</span>${x.id === u.me ? '' : ` <button class="b ghost sm" data-reset2fa="${x.id}" data-email="${esc(x.email)}">Reset</button>`}` : '<span class="badge due-today">Off</span>'}</td>
     <td class="nowrap">${esc(when(x.last_login))}</td>
     <td class="row-end">${x.id === u.me ? '' : `<button class="b ghost sm danger" data-rmuser="${x.id}" data-email="${esc(x.email)}">Remove</button>`}</td></tr>`).join('')}
    </tbody></table></div>
    <details class="help"><summary>What can each role do?</summary><p><b>Admin:</b> everything, including site settings, content, referral commissions, logins and backups. <b>Staff:</b> the Dashboard and Leads only (status, assigning, follow-ups, notes, contact). Staff cannot delete leads or see commissions.</p>
    <p><b>Reset</b> turns off someone's two-step sign-in, for example when they get a new phone. They can sign in with just their password and turn it on again in My account.</p></details></section>

   <section class="card"><h2>Add a login</h2>
    <form id="uf" class="g2">
     <div><label for="un">Name</label><input id="un" autocomplete="off" placeholder="e.g. Kevin Osei-Sarfo"></div>
     <div><label for="ue">Email</label><input id="ue" type="email" required autocomplete="off"></div>
     <div><label for="ur">Role</label><select id="ur"><option value="staff">Staff (leads only)</option><option value="admin">Admin (everything)</option></select></div>
     <div><label for="up">Temporary password (12+ characters)</label><div class="inline-row"><input id="up" type="text" minlength="12" required autocomplete="off" spellcheck="false"><button class="b ghost" type="button" id="gen">Suggest</button></div></div>
     <div class="span2 row-end"><button class="b" type="submit">Add login</button></div></form>
    <p class="hint">Send the email and the temporary password separately (not in the same message). They should change it in My account after signing in, and turn on two-step sign-in.</p></section>

   <section class="card"><h2>Backups</h2>
    ${bk.mode === 'sqlite' ? `<p class="hint">A copy of everything (leads, programs, settings) is saved automatically once a day, and the latest ${bk.keep} are kept, with a copy of every uploaded photo. They are stored on the same computer as the site, so also download one now and then and keep it somewhere safe.</p>
    <div class="bar"><a class="b" href="/admin/api/backup/download">${icon('download')}Download a backup now</a><button class="b ghost" type="button" id="bknow">Make today's backup now</button><span class="hint" id="bkmsg"></span></div>
    ${bk.backups.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Automatic backup</th><th>Size</th></tr></thead><tbody>${bk.backups.map((b) => `<tr><td>${esc(b.name)}</td><td>${kb(b.size)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No automatic backups yet. The first one is made a minute after the site starts.</p>'}`
    : `<p class="hint">"Download a backup now" saves a file with everything (leads, programs, partners, settings) to your computer. Do it regularly, for example every week, and keep the files somewhere safe such as Google Drive. Photos are not in it; keep your own copies of the logo and team photos.</p>
    <div class="bar"><a class="b" href="/admin/api/backup/download">${icon('download')}Download a backup now</a></div>`}</section>

   <section class="card"><div class="card-h"><h2>Recent activity</h2><span class="muted sm">Who changed what</span></div>
    ${act.length ? `<div class="tw scroll"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${act.map((a) => `<tr><td class="nowrap">${esc(when(a.created_at))}</td><td>${esc(a.user_email)}</td><td>${esc(a.action)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nothing yet.</p>'}</section>`,
  { title: 'Team & security', sub: 'Logins, roles, two-step sign-in, backups and the activity log.' });
  $('#gen').onclick = () => { $('#up').value = suggestPassword(); };
  $('#uf').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/users', { method: 'POST', body: { name: $('#un').value, email: $('#ue').value, role: $('#ur').value, password: $('#up').value } }); assignees = null; say(`Login added for ${$('#ue').value}.`); users(); }
    catch (x) { say(x.message, 'err'); users(); }
  };
  root.querySelectorAll('[data-role]').forEach((s) => (s.onchange = async () => {
    try { await api('/users/' + s.dataset.role, { method: 'PATCH', body: { role: s.value } }); say(`Role changed to ${s.value}.`); } catch (x) { say(x.message, 'err'); }
    users();
  }));
  root.querySelectorAll('[data-reset2fa]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`Turn off two-step sign-in for ${b.dataset.email}? They can then sign in with just their password.`)) return;
    try { await api('/users/' + b.dataset.reset2fa, { method: 'PATCH', body: { reset2fa: true } }); say('Two-step sign-in turned off for ' + b.dataset.email + '.'); } catch (x) { say(x.message, 'err'); }
    users();
  }));
  root.querySelectorAll('[data-rmuser]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`Remove the login for ${b.dataset.email}? They will be signed out and their leads become unassigned.`)) return;
    try { await api('/users/' + b.dataset.rmuser, { method: 'DELETE' }); assignees = null; say('Login removed.'); users(); } catch (x) { say(x.message, 'err'); users(); }
  }));
  if ($('#bknow')) $('#bknow').onclick = async () => {
    $('#bkmsg').textContent = 'Working...';
    try { const r = await api('/backup/run', { method: 'POST' }); say(r.made ? `Backup ${r.file} saved.` : `Today's backup (${r.file}) already exists.`); users(); }
    catch (x) { $('#bkmsg').textContent = x.message; }
  };
}

async function account() {
  const current = newScreen();
  const a = await api('/account');
  if (!current()) return;
  shell(`<div class="narrow"><section class="card"><h2>Profile</h2><form id="af" class="g2">
     <div><label for="an">Your name</label><input id="an" value="${esc(a.name)}" placeholder="Shown to your team and on leads you handle"></div>
     <div><label for="aem">Email</label><input id="aem" value="${esc(a.email)}" disabled><p class="hint">You sign in with this. An admin can change it by adding a new login.</p></div>
     <div class="span2"><label class="check"><input type="checkbox" id="adg"${a.digest ? ' checked' : ''}> Daily follow-up email</label><p class="hint">Each morning: the follow-ups due on leads assigned to you, and new leads nobody has picked up yet. Only sent when there is something to do.</p></div>
     <div class="span2 row-end"><button class="b" type="submit">Save profile</button></div></form></section>

   <section class="card" id="tfa"><div class="card-h"><h2>Two-step sign-in</h2>${a.totp_on ? '<span class="badge st-enrolled">On</span>' : '<span class="badge due-today">Off</span>'}</div>
    ${a.totp_on
      ? `<p>When you sign in, you type your password and then a 6-digit code from your authenticator app. If you get a new phone, turn it off here first and set it up again (or ask an admin to reset it).</p>
         <form id="tfaoff" class="inline-row narrow"><input type="password" id="tfapw" placeholder="Your password" autocomplete="current-password" required aria-label="Your password"><button class="b ghost danger" type="submit">Turn off</button></form>`
      : `<p>Adds a second step when you sign in: a 6-digit code from a free app on your phone (Google Authenticator, Microsoft Authenticator or Authy). Someone who learns your password still cannot get in.</p>
         <button class="b" type="button" id="tfastart">${icon('shield')}Turn on two-step sign-in</button><div id="tfasetup"></div>`}</section>

   <section class="card"><h2>Change password</h2><form id="pf" class="g2">
     <div><label for="cp">Current password</label><input id="cp" type="password" autocomplete="current-password" required></div>
     <div><label for="np">New password (12+ characters)</label><input id="np" type="password" autocomplete="new-password" minlength="12" required></div>
     <div class="span2 row-end"><button class="b" type="submit">Change password</button></div></form>
     <p class="hint">Changing it signs you out on your other devices.</p></section></div>`,
  { title: 'My account', sub: esc(a.email) });
  $('#af').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/account', { method: 'POST', body: { name: $('#an').value, digest: $('#adg').checked } }); schema.user.name = $('#an').value.trim(); assignees = null; say('Profile saved.'); account(); }
    catch (x) { say(x.message, 'err'); account(); }
  };
  $('#pf').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/password', { method: 'POST', body: { current: $('#cp').value, next: $('#np').value } }); say('Password changed.'); account(); }
    catch (x) { say(x.message, 'err'); account(); }
  };
  if ($('#tfastart')) $('#tfastart').onclick = async () => {
    try {
      const r = await api('/2fa/setup', { method: 'POST' });
      $('#tfastart').hidden = true;
      $('#tfasetup').innerHTML = `<ol class="steps-ol">
        <li><b>Install an authenticator app</b> on your phone if you do not have one: Google Authenticator, Microsoft Authenticator or Authy (all free).</li>
        <li><b>Scan this code</b> with the app (tap + or "Add account").<div class="qr"><img src="${esc(r.qr)}" alt="QR code for two-step sign-in" width="180" height="180"><div><p class="hint">Cannot scan? Choose "Enter a setup key" in the app and type:</p><code class="secret">${esc(r.secret)}</code></div></div></li>
        <li><b>Type the 6-digit code</b> the app now shows for UGEC Canada:
          <form id="tfaon" class="inline-row narrow"><input id="tfacode" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required aria-label="6-digit code"><button class="b" type="submit">Turn on</button></form></li></ol>`;
      $('#tfacode').focus();
      $('#tfaon').onsubmit = async (ev) => {
        ev.preventDefault();
        try { await api('/2fa/enable', { method: 'POST', body: { code: $('#tfacode').value } }); schema.user.totp_on = true; say('Two-step sign-in is on. Next time you sign in, have your phone ready.'); account(); }
        catch (x) { alert(x.message); $('#tfacode').select(); }
      };
    } catch (x) { say(x.message, 'err'); account(); }
  };
  if ($('#tfaoff')) $('#tfaoff').onsubmit = async (ev) => {
    ev.preventDefault();
    if (!confirm('Turn off two-step sign-in? Your login will be protected by your password only.')) return;
    try { await api('/2fa/disable', { method: 'POST', body: { password: $('#tfapw').value } }); schema.user.totp_on = false; say('Two-step sign-in is off.'); account(); }
    catch (x) { say(x.message, 'err'); account(); }
  };
}

(async () => { try { await boot(); } catch { login(); } })();
})();
