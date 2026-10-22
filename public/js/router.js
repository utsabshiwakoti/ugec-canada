import { S } from './core/state.js';
import { $, api } from './core/util.js';
import { ALIASES } from './core/config.js';
import { cleanPath, needs, pageFor } from './core/pages.js';
import { shell } from './components/shell.js';
import { t } from './core/tpl.js';

export async function render(keepScroll, hydrate = false) {
  const url = new URL(location.href);
  const path = cleanPath(url.pathname);
  if (ALIASES[path]) {
    const [p, qs] = ALIASES[path].split('?'); const merged = new URLSearchParams(qs || ''); url.searchParams.forEach((v, k) => merged.set(k, v));
    const qs2 = merged.toString(); history.replaceState(null, '', p + (qs2 ? '?' + qs2 : '')); return render(keepScroll);
  }
  let page;
  try {
    const need = needs(path);
    let loaded = null;
    if (need === 'posts') S.posts = S.posts || await api('/api/posts').catch(() => []);
    else if (need && need.post) loaded = await api('/api/posts/' + encodeURIComponent(need.post)).catch(() => null);
    else if (need && need.portal) loaded = await api('/api/portal/' + encodeURIComponent(need.portal)).catch(() => null);
    page = pageFor(path, url.searchParams, loaded);
  } catch (e) {
    console.error(e);
    page = { title: 'UGEC Canada', html: t('components/page-head', { title: 'Something went wrong', lede: 'Please refresh the page, or message us on WhatsApp.' }) };
  }
  if (hydrate) return;
  shell(path);
  $('#app').innerHTML = page.html;
  document.title = page.title;
  if (!keepScroll) { window.scrollTo(0, 0); $('#app').focus({ preventScroll: true }); }
  $('#nav').classList.remove('open'); $('#burger').setAttribute('aria-expanded', 'false');
}

export function go(href) { S.bookPre = null; history.pushState(null, '', href); return render(false); }
