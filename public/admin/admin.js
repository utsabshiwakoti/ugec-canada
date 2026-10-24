(() => {
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#root');
let schema = null, me = null, tab = 'leads', flash = null;

async function api(path, opt = {}) {
  const r = await fetch('/admin/api' + path, { credentials: 'same-origin', ...opt,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ugec', ...(opt.headers || {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { me = null; login(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
async function prepareImage(file, { crop = '', max = 1600, format = 'jpeg' } = {}) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('Could not read that image. Please use a JPG, PNG or WebP file.'); }
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (crop === 'square') { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) * 0.3; sw = sh = s; }
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const g = c.getContext('2d');
  if (format !== 'png') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } // JPEG has no transparency
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('Could not process that image.'))), format === 'png' ? 'image/png' : 'image/jpeg', 0.88));
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
  const pick = box.querySelector('[data-pick]');
  const show = (url) => { prev.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<span>None</span>'; clear.hidden = !url; pick.textContent = url ? 'Change' : 'Upload'; };
  pick.onclick = () => file.click();
  const changed = () => hidden.dispatchEvent(new Event('change', { bubbles: true })); // lets previews follow along
  clear.onclick = () => { hidden.value = ''; show(''); changed(); note.textContent = 'Removed. Click Save to apply.'; };
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    const save = form.querySelector('button[type=submit]');
    note.textContent = 'Uploading...'; save.disabled = true;
    const opts = { crop: box.dataset.crop, max: Number(box.dataset.max) || 1600, format: box.dataset.format };
    try { hidden.value = await uploadPhoto(box.dataset.folder, await prepareImage(f, opts)); show(hidden.value); changed(); note.textContent = 'Image ready. Click Save to apply.'; }
    catch (x) { note.textContent = x.message; }
    finally { save.disabled = false; file.value = ''; }
  };
}
let screenNo = 0;
const newScreen = () => { const n = ++screenNo; return () => n === screenNo; };
const msg = () => { const m = flash; flash = null; return m ? `<div class="msg ${m.t}" role="status">${esc(m.m)}</div>` : ''; };
const say = (m, t = 'ok') => { flash = { m, t }; };

function login(error) {
  root.innerHTML = `<form class="login" id="lf"><h1>UGEC Canada admin</h1>${error ? `<div class="msg err">${esc(error)}</div>` : ''}
    <label for="e">Email</label><input id="e" type="email" autocomplete="username" required>
    <label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required>
    <p><button class="b" style="width:100%;margin-top:14px">Sign in</button></p></form>`;
  $('#lf').onsubmit = async (ev) => {
    ev.preventDefault();
    try { me = await api('/login', { method: 'POST', body: { email: $('#e').value, password: $('#p').value } }); await boot(); }
    catch (x) { login(x.message); }
  };
}

const TABS = () => [['leads', 'Leads'], ['referrals', 'Referrals'], ...Object.entries(schema.resources).map(([k, r]) => [k, r.label]), ['settings', 'Site settings'], ['users', 'Admin users'], ['account', 'Account']];
const when = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
function shell(inner) {
  root.innerHTML = `<div class="shell"><aside><h1>UGEC admin</h1><nav>${TABS().map(([k, l]) => `<button data-tab="${k}" aria-current="${k === tab}">${esc(l)}</button>`).join('')}</nav>
   <div class="who">${esc(me.email)}</div><nav><button id="out">Sign out</button><button id="view">View site</button></nav></aside><main>${msg()}${inner}</main></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
  $('#out').onclick = async () => { await api('/logout', { method: 'POST' }); me = null; login(); };
  $('#view').onclick = () => window.open('/', '_blank');
}
async function boot() { schema = await api('/schema'); draw(); }
async function draw() {
  try {
    if (tab === 'leads') return await leads();
    if (tab === 'referrals') return await referrals();
    if (tab === 'settings') return await settings();
    if (tab === 'users') return await users();
    if (tab === 'account') return account();
    return await list(tab);
  } catch (x) { if (x.message !== 'Signed out') { say(x.message, 'err'); shell('<p>Could not load this section.</p>'); } }
}

let lf = { status: 'all', form: 'all', partner: 'all', q: '' };
const money = (n) => '$' + Number(n || 0).toFixed(2);
const METHOD = { link: "arrived through the partner's link", selected: 'chosen by the client from the list', typed: 'typed by the client (not matched)' };
async function leads() {
  const qs = new URLSearchParams(lf).toString();
  const current = newScreen();
  const d = await api('/leads?' + qs);
  if (!current()) return;
  const cnt = Object.fromEntries(d.counts.map((c) => [c.status, c.c]));
  const cstat = schema.commissionStatuses;
  shell(`<h1>Leads</h1>
   <div class="counts">${schema.leadStatuses.map((s) => `<span class="pill ${s === 'new' ? 'new' : ''}">${esc(s)}: ${cnt[s] || 0}</span>`).join('')}</div>
   <div class="bar" style="margin-top:14px">
    <select id="fs" aria-label="Status" style="width:auto"><option value="all">All statuses</option>${schema.leadStatuses.map((s) => `<option${lf.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <select id="ff" aria-label="Form" style="width:auto"><option value="all">All forms</option>${d.forms.map((f) => `<option value="${esc(f.type)}"${lf.form === f.type ? ' selected' : ''}>${esc(f.title)}</option>`).join('')}</select>
    <select id="fp" aria-label="Referral partner" style="width:auto"><option value="all">All referrals</option><option value="any"${lf.partner === 'any' ? ' selected' : ''}>Any partner</option><option value="none"${lf.partner === 'none' ? ' selected' : ''}>No partner</option>${d.partners.map((p) => `<option value="${p.id}"${String(lf.partner) === String(p.id) ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <input id="fq" placeholder="Search name, email, phone, program, partner" value="${esc(lf.q)}" style="width:auto;flex:1;min-width:200px">
    <a class="b line" href="/admin/api/leads.csv?${qs}">Export CSV</a></div>
   ${d.rows.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Name</th><th>Form</th><th>Program</th><th>Referred by</th><th>Status</th><th></th></tr></thead><tbody>
   ${d.rows.map((r) => `<tr><td>${esc(r.created_at.slice(0, 16))}</td><td>${esc(r.name || r.email)}</td><td>${esc(r.form_type)}</td><td>${esc(r.program)}</td>
    <td>${r.partner_name ? esc(r.partner_name) + (r.commission_status !== 'none' ? ` <span class="pill ${r.commission_status === 'paid' ? 'ok' : ''}">${esc(r.commission_status)}</span>` : '') : r.referral_other ? `<span class="hint">${esc(r.referral_other)} (unmatched)</span>` : ''}</td>
    <td><span class="pill ${r.status === 'new' ? 'new' : ''}">${esc(r.status)}</span></td><td><button class="b line" data-open="${r.id}">Open</button></td></tr>
   <tr id="d${r.id}" hidden><td colspan="7"><div class="det"><dl>${Object.entries(r.data).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="row2"><div><label>Status</label><select data-st="${r.id}">${schema.leadStatuses.map((s) => `<option${r.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <div><label>Internal notes</label><textarea data-nt="${r.id}">${esc(r.notes)}</textarea></div></div>
    <h3 style="margin-top:14px">Referral and commission</h3>
    <div class="row2"><div><label>Referred by</label><select data-rp="${r.id}"><option value="">No partner</option>${d.partners.map((p) => `<option value="${p.id}"${r.referral_partner_id === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <p class="hint">${r.referral_method ? esc(METHOD[r.referral_method] || '') : 'The client did not name a referrer.'}${r.referral_other ? ` Typed: "${esc(r.referral_other)}". Assign a partner above if you recognize them.` : ''}</p></div>
    <div><label>Commission</label><div class="row2"><select data-cs="${r.id}">${cstat.map((s) => `<option${r.commission_status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <input type="number" min="0" step="0.01" data-ca="${r.id}" value="${esc(r.commission_amount)}" aria-label="Commission amount in CAD"></div>
      <p class="hint">Amount in CAD. Verify the referral before marking approved.</p></div></div>
    <div class="bar" style="margin-top:10px"><button class="b" data-save="${r.id}">Save</button><button class="b red" data-del="${r.id}">Delete lead</button></div></div></td></tr>`).join('')}
   </tbody></table></div>` : '<div class="card">No leads match.</div>'}`);
  const reload = () => { lf = { status: $('#fs').value, form: $('#ff').value, partner: $('#fp').value, q: $('#fq').value }; leads(); };
  $('#fs').onchange = reload; $('#ff').onchange = reload; $('#fp').onchange = reload;
  $('#fq').onkeydown = (e) => { if (e.key === 'Enter') reload(); };
  root.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { const r = $('#d' + b.dataset.open); r.hidden = !r.hidden; }));
  root.querySelectorAll('[data-save]').forEach((b) => (b.onclick = async () => {
    const id = b.dataset.save;
    try {
      await api('/leads/' + id, { method: 'PATCH', body: { status: $(`[data-st="${id}"]`).value, notes: $(`[data-nt="${id}"]`).value,
        referral_partner_id: $(`[data-rp="${id}"]`).value, commission_status: $(`[data-cs="${id}"]`).value, commission_amount: $(`[data-ca="${id}"]`).value } });
      say('Lead saved.'); leads();
    } catch (x) { say(x.message, 'err'); leads(); }
  }));
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this lead permanently?')) return;
    try { await api('/leads/' + b.dataset.del, { method: 'DELETE' }); say('Lead deleted.'); leads(); } catch (x) { say(x.message, 'err'); }
  }));
}

async function referrals(invite = null) {
  const current = newScreen();
  const d = await api('/referrals/summary');
  if (!current()) return;
  const base = d.siteUrl || location.origin;
  const link = (code) => `${base}/?ref=${code}`;
  const tot = d.partners.reduce((a, p) => ({ pending: a.pending + p.pending, approved: a.approved + p.approved, paid: a.paid + p.paid, total: a.total + p.total }), { pending: 0, approved: 0, paid: 0, total: 0 });
  shell(`<div class="bar"><h1 class="grow" style="margin:0">Referrals</h1><button class="b" id="addp">Add partner</button></div>
   <p>Clients pick who referred them on the website forms, or arrive through a partner's link. Open a lead to confirm the referral and set the commission. Commission amounts are in CAD.</p>
   <p class="hint">Partners can sign in to their own <a href="/referral-portal" target="_blank" rel="noopener">referral partner portal</a> (separate from this admin panel) to follow their referrals: first name and last initial, what they asked about, progress and commission, never contact details. To give a partner access, add their email in Referral partners, then click <strong>Send sign-in invite</strong>: they get a link to choose their own password. Use it again if they forget their password.</p>
   ${invite ? `<div class="card invite" role="status"><h2>Sign-in invite for ${esc(invite.name)}</h2>
     <p>${invite.emailed ? `Emailed to <strong>${esc(invite.email)}</strong>. You can also send this link yourself (for example on WhatsApp):` : `Email is not set up, so send this link to ${esc(invite.name)} yourself (for example on WhatsApp or by email to ${esc(invite.email)}):`}</p>
     <div class="bar" style="margin:0"><input class="grow" readonly value="${esc(invite.link)}" aria-label="Invite link"><button class="b" data-copy="${esc(invite.link)}">Copy link</button></div>
     <p class="hint">The link works for 7 days and only once. They choose their password, then sign in with ${esc(invite.email)}.</p></div>` : ''}
   <div class="counts"><span class="pill">Referred leads: ${tot.total}</span><span class="pill">Pending: ${money(tot.pending)}</span><span class="pill">Approved, unpaid: ${money(tot.approved)}</span><span class="pill ok">Paid: ${money(tot.paid)}</span></div>
   <div class="tw" style="margin-top:14px"><table><thead><tr><th>Partner</th><th>Referral link</th><th>Portal sign-in</th><th>Leads</th><th>Booked</th><th>Applied</th><th>Enrolled</th><th>Pending</th><th>Approved</th><th>Paid</th><th></th></tr></thead><tbody>
   ${d.partners.map((p) => `<tr><td><strong>${esc(p.name)}</strong>${p.active ? '' : ' <span class="pill">inactive</span>'}${p.listed ? '' : ' <span class="pill">link only</span>'}<br><span class="hint">${esc(p.code)}</span></td>
    <td><button class="b line" data-copy="${esc(link(p.code))}">Copy link</button></td>
    <td>${portalStatus(p)}<br><button class="b line" style="margin-top:4px" data-invite="${p.id}"${p.email && p.portal_enabled ? '' : ' disabled'} title="${p.email ? (p.portal_enabled ? 'Send a link to choose a password' : 'Portal sign-in is turned off for this partner') : 'Add an email address first'}">${p.has_password ? 'Send password reset' : 'Send sign-in invite'}</button></td><td>${p.total}</td><td>${p.booked}</td><td>${p.applied}</td><td>${p.enrolled}</td><td>${money(p.pending)}</td><td>${money(p.approved)}</td><td>${money(p.paid)}</td>
    <td><button class="b line" data-leads="${p.id}">View leads</button></td></tr>`).join('') || '<tr><td colspan="11">No partners yet. Add one to start tracking referrals.</td></tr>'}</tbody></table></div>
   <p class="hint" style="margin-top:12px">Leads with no partner: ${d.unattributed}${d.other ? `, including ${d.other} where the client typed a name that did not match a partner` : ''}. <button class="b line" id="unm">Review them</button></p>`);
  $('#addp').onclick = () => { tab = 'partners'; draw(); };
  $('#unm').onclick = () => { lf = { status: 'all', form: 'all', partner: 'none', q: '' }; tab = 'leads'; draw(); };
  root.querySelectorAll('[data-leads]').forEach((b) => (b.onclick = () => { lf = { status: 'all', form: 'all', partner: b.dataset.leads, q: '' }; tab = 'leads'; draw(); }));
  root.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch { prompt('Copy this link:', b.dataset.copy); } }));
  root.querySelectorAll('[data-invite]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { const r = await api(`/partners/${b.dataset.invite}/invite`, { method: 'POST' }); referrals({ ...r, name: d.partners.find((p) => String(p.id) === b.dataset.invite).name }); window.scrollTo(0, 0); }
    catch (x) { say(x.message, 'err'); referrals(); }
  }));
}
function portalStatus(p) {
  if (!p.portal_enabled) return '<span class="pill">sign-in off</span>';
  if (!p.email) return '<span class="hint">needs an email</span>';
  if (p.has_password) return `<span class="pill ok">can sign in</span><br><span class="hint">last: ${esc(when(p.last_login))}</span>`;
  return p.invited ? '<span class="pill">invited</span>' : '<span class="hint">not invited yet</span>';
}

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

function input(f, v, opts = {}) {
  const id = 'f_' + f.n, name = `name="${f.n}"`;
  if (f.t === 'range') {
    const val = v || f.def;
    return `<label for="${id}">${esc(f.l)}</label><div class="range-field"><input type="range" id="${id}" ${name} min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${esc(val)}" data-unit="${esc(f.unit || '')}"><output for="${id}">${esc(val)} ${esc(f.unit || '')}</output></div>` +
      (f.preview ? `<div class="logo-preview" data-preview="${esc(f.preview)}" data-for="${id}"><div class="lp-bar"><span class="lp-logo"></span><span class="lp-nav"><i>Home</i><i>Already in Canada</i><i>Contact Us</i><b>Book Consultation</b></span></div>
        <p class="hint">How the header will look. Phones show the logo slightly smaller. Click Save to apply.</p></div>` : '');
  }
  if (f.t === 'heading') return `<h2 class="sec-h">${esc(f.l)}</h2>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}`;
  if (f.t === 'list' || f.t === 'map') return `<div class="le" data-le="${esc(f.n)}"><label>${esc(f.l)}</label><input type="hidden" ${name} value="${esc(v)}">
    <div class="le-items"></div><button type="button" class="b line" data-le-add>+ ${esc(f.add || 'Add')}</button></div>`;
  if (f.t === 'checkbox') return `<div class="chk"><input type="checkbox" id="${id}" ${name}${v ? ' checked' : ''}><label for="${id}" style="margin:0">${esc(f.l)}</label></div>`;
  if (f.t === 'image') return `<label>${esc(f.l)}</label><div class="img-field" data-folder="${esc(f.folder)}" data-crop="${esc(f.crop || '')}" data-max="${esc(f.max || '')}" data-format="${esc(f.format || '')}">
    <div class="img-prev${f.crop === 'square' ? '' : ' wide'}">${v ? `<img src="${esc(v)}" alt="">` : '<span>None</span>'}</div>
    <div><input type="hidden" ${name} value="${esc(v)}"><input type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="${esc(f.l)}">
      <div class="bar" style="margin:0"><button type="button" class="b line" data-pick>${v ? 'Change' : 'Upload'}</button><button type="button" class="b line" data-clear${v ? '' : ' hidden'}>Remove</button></div>
      <p class="hint">JPG, PNG or WebP. ${f.crop === 'square' ? 'It is cropped to a square and resized automatically.' : 'It is resized automatically.'} Click Save to apply.</p></div></div>`;
  let c;
  if (f.t === 'textarea') c = `<textarea id="${id}" ${name} rows="${f.rows || 4}">${esc(v)}</textarea>`;
  else if (f.t === 'json') c = `<textarea id="${id}" ${name} class="json" rows="${f.rows || 10}" spellcheck="false">${esc(v)}</textarea>`;
  else if (f.t === 'select') c = `<select id="${id}" ${name}>${f.o.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(v ?? f.o[0][0] ?? f.o[0]) === val ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else if (f.t === 'ref') c = `<select id="${id}" ${name}><option value="">None</option>${(opts.refs[f.ref] || []).map((o) => `<option value="${o.id}"${String(v) === String(o.id) ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
  else {
    const dl = f.suggest ? ` list="dl_${f.n}"` : '';
    c = `<input id="${id}" ${name} type="${f.t === 'number' ? 'number' : f.t === 'date' ? 'date' : 'text'}" value="${esc(v)}"${f.r ? ' required' : ''}${dl}>` +
      (f.suggest ? `<datalist id="dl_${f.n}">${[...new Set((opts.rows || []).map((r) => r[f.n]).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : '');
  }
  return `<label for="${id}">${esc(f.l)}${f.r ? ' *' : ''}</label>${c}`;
}
function collect(form, def) {
  const o = {};
  for (const f of def.fields) {
    const el = form.elements[f.n]; if (!el) continue;
    o[f.n] = f.t === 'checkbox' ? el.checked : el.value;
  }
  return o;
}
async function list(key) {
  const def = schema.resources[key];
  const current = newScreen();
  const rows = await api('/' + key);
  if (!current()) return;
  const col = (r, c) => {
    const f = def.fields.find((x) => x.n === c); const v = r[c];
    if (f && f.t === 'image') return v ? `<img class="thumb" src="${esc(v)}" alt="">` : '<span class="thumb none" aria-label="No photo"></span>';
    return f && f.t === 'checkbox' ? (v ? '<span class="pill ok">yes</span>' : '<span class="pill">no</span>') : esc(v);
  };
  shell(`<div class="bar"><h1 class="grow" style="margin:0">${esc(def.label)}</h1><button class="b" id="new">Add new</button></div>
   <div class="tw"><table><thead><tr>${def.list.map((c) => `<th>${esc((def.fields.find((f) => f.n === c) || { l: c }).l)}</th>`).join('')}<th></th></tr></thead><tbody>
   ${rows.map((r) => `<tr>${def.list.map((c) => `<td>${col(r, c)}</td>`).join('')}<td><button class="b line" data-edit="${esc(r[def.id])}">Edit</button></td></tr>`).join('') || `<tr><td colspan="${def.list.length + 1}">Nothing here yet.</td></tr>`}</tbody></table></div>`);
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
  shell(`<p><button class="b line" id="back">Back to list</button></p><div class="card"><h2>${isNew ? 'Add' : 'Edit'}: ${esc(def.label)}</h2>
   <form id="ef">${def.fields.map((f) => (f.n === def.id && !isNew && !def.idEditable ? '' : input(f, defaults[f.n], { refs, rows }))).join('')}
   <div class="bar" style="margin-top:18px"><button class="b" type="submit">Save</button>${isNew ? '' : '<button class="b red" type="button" id="rm">Delete</button>'}</div></form></div>`);
  $('#back').onclick = () => draw();
  root.querySelectorAll('.img-field').forEach((box) => imageField(box, $('#ef')));
  mountLists(def.fields);
  $('#ef').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const body = collect(ev.target, def);
      await api(isNew ? '/' + key : `/${key}/${encodeURIComponent(row[def.id])}`, { method: isNew ? 'POST' : 'PUT', body });
      say('Saved.'); draw();
    } catch (x) { say(x.message, 'err'); const m = document.createElement('div'); m.className = 'msg err'; m.textContent = x.message; $('#ef').prepend(m); window.scrollTo(0, 0); }
  };
  if (!isNew) $('#rm').onclick = async () => {
    if (!confirm('Delete this item permanently?')) return;
    try { await api(`/${key}/${encodeURIComponent(row[def.id])}`, { method: 'DELETE' }); say('Deleted.'); draw(); } catch (x) { say(x.message, 'err'); }
  };
}

async function settings() {
  const current = newScreen();
  const [s, mail] = await Promise.all([api('/settings'), api('/email')]);
  if (!current()) return;
  shell(`<h1>Site settings</h1>
   <div class="card"><h2>Email</h2>${mail.enabled
    ? `<p>Email is set up${mail.mode === 'gateway' ? ' (through GoDaddy\'s email service)' : ''}: new leads are emailed to the team${s.confirm_email !== '0' ? ', and people who send a form get a confirmation' : ''}.</p><div class="bar" style="margin:0"><button class="b line" type="button" id="testmail">Send a test email to me</button><span class="hint" id="testmsg"></span></div>`
    : '<p>Email is <strong>not set up yet</strong>, so new leads only appear in Leads and nobody is emailed. To turn it on, add the SMTP settings from your email provider to the <code>.env</code> file (see README, "Lead emails") and restart the site.</p>'}</div>
   <div class="card"><form id="sf">${schema.settingsFields.map((f) => input(f, f.t === 'checkbox' ? s[f.n] === '1' : s[f.n])).join('')}
   <div class="bar" style="margin-top:18px"><button class="b" type="submit">Save settings</button></div></form></div>`);
  root.querySelectorAll('.img-field').forEach((box) => imageField(box, $('#sf')));
  mountLists(schema.settingsFields);
  mountRanges($('#sf'));
  if ($('#testmail')) $('#testmail').onclick = async () => {
    $('#testmsg').textContent = 'Sending...';
    try { const r = await api('/email/test', { method: 'POST' }); $('#testmsg').textContent = `Sent to ${r.to}. Check that inbox (and spam).`; }
    catch (x) { $('#testmsg').textContent = x.message; }
  };
  $('#sf').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/settings', { method: 'PUT', body: collect(ev.target, { fields: schema.settingsFields }) }); say('Settings saved. Changes are live within a minute.'); settings(); }
    catch (x) { say(x.message, 'err'); settings(); }
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
  shell(`<h1>Admin users</h1>
   <div class="card"><h2>Logins</h2>
    <p class="hint" style="margin-bottom:12px">Give each team member their own login, so you can see who changed what and remove someone's access when they leave.</p>
    <div class="tw"><table><thead><tr><th>Email</th><th>Added</th><th>Last sign-in</th><th></th></tr></thead><tbody>
    ${u.users.map((x) => `<tr><td>${esc(x.email)}${x.id === u.me ? ' <span class="pill">you</span>' : ''}</td><td>${esc(when(x.created_at))}</td><td>${esc(when(x.last_login))}</td>
     <td>${x.id === u.me ? '' : `<button class="b red" data-rmuser="${x.id}" data-email="${esc(x.email)}">Remove</button>`}</td></tr>`).join('')}
    </tbody></table></div>
    <h3 style="margin-top:18px">Add a login</h3>
    <form id="uf"><div class="row2"><div><label for="ue">Email</label><input id="ue" type="email" required autocomplete="off"></div>
     <div><label for="up">Temporary password (12+ characters)</label><input id="up" type="text" minlength="12" required autocomplete="off" spellcheck="false"></div></div>
     <div class="bar" style="margin-top:12px"><button class="b" type="submit">Add login</button><button class="b line" type="button" id="gen">Suggest a password</button></div></form>
    <p class="hint">Send the person their email and temporary password privately (not in the same message), and ask them to change it in Account after signing in.</p></div>

   <div class="card"><h2>Backups</h2>
    ${bk.mode === 'sqlite' ? `<p class="hint" style="margin-bottom:12px">A copy of everything (leads, programs, settings) is saved automatically once a day, and the latest ${bk.keep} are kept, together with a copy of every uploaded photo. They are stored on the same computer as the site, so also download one now and then and keep it somewhere safe.</p>
    <div class="bar"><a class="b" href="/admin/api/backup/download">Download a backup now</a><button class="b line" type="button" id="bknow">Make today's backup now</button><span class="hint" id="bkmsg"></span></div>
    ${bk.backups.length ? `<div class="tw"><table><thead><tr><th>Automatic backup</th><th>Size</th></tr></thead><tbody>${bk.backups.map((b) => `<tr><td>${esc(b.name)}</td><td>${kb(b.size)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No automatic backups yet. The first one is made a minute after the site starts.</p>'}`
    : `<p class="hint" style="margin-bottom:12px">"Download a backup now" saves a file with everything (leads, programs, partners, settings) to your computer. Do it regularly, for example every week, and keep the files somewhere safe such as Google Drive. Photos are not in it; keep your own copies of the logo and team photos.</p>
    <div class="bar"><a class="b" href="/admin/api/backup/download">Download a backup now</a></div>`}</div>

   <div class="card"><h2>Recent activity</h2>
    ${act.length ? `<div class="tw"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${act.map((a) => `<tr><td style="white-space:nowrap">${esc(when(a.created_at))}</td><td>${esc(a.user_email)}</td><td>${esc(a.action)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nothing yet.</p>'}</div>`);
  $('#gen').onclick = () => { $('#up').value = suggestPassword(); };
  $('#uf').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/users', { method: 'POST', body: { email: $('#ue').value, password: $('#up').value } }); say(`Login added for ${$('#ue').value}.`); users(); }
    catch (x) { say(x.message, 'err'); users(); }
  };
  root.querySelectorAll('[data-rmuser]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`Remove the login for ${b.dataset.email}? They will be signed out and can no longer use the admin panel.`)) return;
    try { await api('/users/' + b.dataset.rmuser, { method: 'DELETE' }); say('Login removed.'); users(); } catch (x) { say(x.message, 'err'); users(); }
  }));
  if ($('#bknow')) $('#bknow').onclick = async () => {
    $('#bkmsg').textContent = 'Working...';
    try { const r = await api('/backup/run', { method: 'POST' }); say(r.made ? `Backup ${r.file} saved.` : `Today's backup (${r.file}) already exists.`); users(); }
    catch (x) { $('#bkmsg').textContent = x.message; }
  };
}

function account() {
  newScreen();
  shell(`<h1>Account</h1><div class="card"><h2>Change password</h2><form id="pf">
   <label for="cp">Current password</label><input id="cp" type="password" autocomplete="current-password" required>
   <label for="np">New password (12+ characters)</label><input id="np" type="password" autocomplete="new-password" minlength="12" required>
   <div class="bar" style="margin-top:18px"><button class="b" type="submit">Change password</button></div></form></div>`);
  $('#pf').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/password', { method: 'POST', body: { current: $('#cp').value, next: $('#np').value } }); say('Password changed.'); account(); }
    catch (x) { say(x.message, 'err'); account(); }
  };
}

(async () => { try { me = await api('/me'); await boot(); } catch { login(); } })();
})();
