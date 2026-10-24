import { find } from './util.js';
import { TITLES } from './config.js';
import { t } from './tpl.js';
import { home } from '../pages/home.js';
import { about } from '../pages/about.js';
import { already } from '../pages/already.js';
import { book } from '../pages/book.js';
import { partner } from '../pages/partner.js';
import { contact } from '../pages/contact.js';
import { blog, post } from '../pages/blog.js';
import { programPage } from '../pages/program.js';
import { legal } from '../pages/legal.js';
import { portalLogin, portalPage, setPasswordPage } from '../pages/portal.js';

export const cleanPath = (pathname) => (pathname.length > 1 ? pathname.replace(/\/$/, '') : '/');

export function needs(path) {
  if (path === '/' || path === '/blog') return 'posts';
  if (path.startsWith('/blog/')) return { post: decodeURIComponent(path.split('/')[2] || '') };
  if (path === '/referral-portal') return { portal: true };
  if (path.startsWith('/referral-portal/set-password/')) return { setPassword: decodeURIComponent(path.split('/')[3] || '') };
  return null;
}

export function pageFor(path, q, loaded = null) {
  let html = '', title = TITLES[path];
  if (path === '/') html = home();
  else if (path === '/about') html = about();
  else if (path === '/pr-leading-courses') html = already(q);
  else if (path === '/educational-assistance') html = t('pages/educational-assistance');
  else if (path === '/immigration-assistance') html = t('pages/immigration-assistance');
  else if (path === '/book-consultation') html = book(q);
  else if (path === '/partner-with-us') html = partner();
  else if (path === '/contact') html = contact();
  else if (path === '/blog') html = blog();
  else if (path === '/referral-portal') {
    if (loaded) { html = portalPage(loaded); title = 'Your referrals | UGEC Canada'; } else html = portalLogin();
  } else if (path.startsWith('/referral-portal/set-password/')) {
    html = loaded ? setPasswordPage(path.split('/')[3], loaded)
      : portalLogin('This link has expired or was already used. Sign in below, or use "Forgot your password?" to get a new link.');
    title = 'Set your password | UGEC Canada';
  } else if (path.startsWith('/blog/')) {
    if (loaded) { html = post(loaded); title = loaded.title + ' | UGEC Canada'; }
  } else if (path.startsWith('/programs/')) {
    const p = find(path.split('/')[2]);
    if (p) { html = programPage(p); title = `${p.name} (${p.province}) | UGEC Canada`; }
  } else if (path.startsWith('/legal/')) {
    const l = legal(path.split('/')[2]); if (l) { html = l.html; title = l.title; }
  }
  if (!html) return { found: false, title: 'Page not found | UGEC Canada', html: t('components/page-head', { title: 'Page not found', lede: 'That page does not exist. Use the menu to find what you need.' }) };
  return { found: true, title, html };
}
