import { S } from './core/state.js';
import { $, WA, api, esc } from './core/util.js';
import { t } from './core/tpl.js';
import { closeMenus } from './components/shell.js';
import { go, render } from './router.js';

document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-act="bm"]')) closeMenus();
  const a = e.target.closest('a[href]');
  if (a && !a.target && a.origin === location.origin && !a.hasAttribute('download') && !a.getAttribute('href').startsWith('#') && !a.pathname.startsWith('/admin') && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault(); go(a.pathname + a.search); return;
  }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, v = b.dataset.v;
  if (act === 'bm') { const m = b.nextElementSibling, open = m.hidden; closeMenus(); m.hidden = !open; b.setAttribute('aria-expanded', String(open)); return; }
  if (act === 'copy') { copyText(b, v); return; }
  if (act === 'portal-logout') { portalPost('logout', {}).finally(() => render(false)); return; }
  if (act === 'sprov') S.sProv = v; else if (act === 'scat') S.sCat = v; else if (act === 'view') S.view = v; else if (act === 'bannerx') S.bannerOff = true;
  if (location.search.includes('cat=')) history.replaceState(null, '', location.pathname);
  render(true);
});

async function copyText(btn, text) {
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch { const box = btn.parentElement.querySelector('[data-select]'); if (box) { box.focus(); box.select(); } btn.textContent = 'Press Ctrl+C to copy'; }
  setTimeout(() => { btn.textContent = label; }, 2500);
}
document.addEventListener('focusin', (e) => { if (e.target.matches('[data-select]')) e.target.select(); });

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

$('#burger').addEventListener('click', () => { const o = $('#nav').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', o); });

document.addEventListener('change', (e) => {
  if (e.target.name === 'referral_partner') { const o = e.target.closest('form').querySelector('.ref-other'); if (o) o.hidden = e.target.value !== '__other'; }
  if (e.target.id === 'bookType') {
    const f = $('form[data-form]'), pre = {};
    if (f) new FormData(f).forEach((v, k) => { if (k !== 'hp') pre[k] = String(v); });
    S.bookPre = pre; S.bookType = e.target.value;
    history.replaceState(null, '', '/book-consultation?type=' + S.bookType);
    render(true).then(() => { const s = $('#bookType'); if (s) s.focus(); });
  }
});

window.addEventListener('popstate', () => { S.bookPre = null; render(false); });

const portalPost = (path, body) => api('/api/portal/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ugec' }, body: JSON.stringify(body) });
async function portalForm(f, work) {
  if (!f.reportValidity()) return;
  const btn = f.querySelector('button[type=submit]'), err = f.querySelector('.err'), label = btn.textContent;
  err.hidden = true; btn.disabled = true; btn.textContent = 'Please wait...';
  try { await work(); } catch (x) { err.textContent = x.message; err.hidden = false; }
  btn.disabled = false; btn.textContent = label;
}
const done = (f, html) => { const div = document.createElement('div'); div.className = 'sent'; div.setAttribute('role', 'status'); div.innerHTML = html; f.replaceWith(div); };
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-portal-login],form[data-portal-forgot],form[data-portal-set],form[data-portal-password]'); if (!f) return;
  e.preventDefault();
  const v = (n) => f.elements[n].value;
  if (f.matches('[data-portal-login]')) portalForm(f, async () => { await portalPost('login', { email: v('email'), password: v('password') }); await render(false); });
  else if (f.matches('[data-portal-forgot]')) portalForm(f, async () => {
    const r = await portalPost('forgot', { email: v('email') });
    done(f, r.emailEnabled
      ? `<h3>Check your inbox</h3><p>If ${esc(v('email'))} belongs to a referral partner, we have emailed a link to choose a new password. It works for 1 hour; check your spam folder too.</p>`
      : `<h3>Please contact us</h3><p>We cannot send emails from the website at the moment. Message UGEC Canada and we will send you a new link.</p><div class="btns"><a class="btn btn-wa" target="_blank" rel="noopener" href="${WA('Hi UGEC, I am a referral partner and forgot my portal password.')}">WhatsApp UGEC</a></div>`);
  });
  else if (f.matches('[data-portal-set]')) portalForm(f, async () => {
    if (v('password') !== v('confirm')) throw new Error('The two passwords are not the same.');
    await portalPost('set-password', { code: f.dataset.code, password: v('password') });
    await go('/referral-portal');
  });
  else portalForm(f, async () => { await portalPost('password', { current: v('current'), next: v('next') }); done(f, '<h3>Password changed</h3><p>Use your new password next time you sign in. Other devices have been signed out.</p>'); });
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  if (!f.reportValidity()) return;
  const btn = f.querySelector('button[type=submit]'), err = f.querySelector('.err');
  const values = {}; new FormData(f).forEach((v, k) => { if (k !== 'hp') values[k] = String(v); });
  const rp = values.referral_partner || '', ro = (values.referral_other || '').trim(); delete values.referral_partner; delete values.referral_other;
  const referral = rp && rp !== '__other' ? { code: rp, via: S.ref && S.ref.code === rp ? 'link' : 'selected' } : (rp === '__other' && ro ? { other: ro } : {});
  err.hidden = true; btn.disabled = true; const label = btn.textContent; btn.textContent = 'Sending...';
  try {
    await api('/api/leads/' + f.dataset.form, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values, referral, hp: f.elements.hp.value }) });
    const div = document.createElement('div'); div.className = 'sent'; div.setAttribute('role', 'status');
    div.innerHTML = t('components/form-sent', { wa: WA('Hi UGEC, I just sent a request on your website.') });
    f.replaceWith(div); div.scrollIntoView({ block: 'center' });
  } catch (x) {
    err.textContent = x.message + ' You can also message us on WhatsApp.'; err.hidden = false; btn.disabled = false; btn.textContent = label;
  }
});
