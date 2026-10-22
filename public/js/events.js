import { S } from './core/state.js';
import { $, WA, api } from './core/util.js';
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
  if (act === 'sprov') S.sProv = v; else if (act === 'scat') S.sCat = v; else if (act === 'view') S.view = v; else if (act === 'bannerx') S.bannerOff = true;
  if (location.search.includes('cat=')) history.replaceState(null, '', location.pathname);
  render(true);
});

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
