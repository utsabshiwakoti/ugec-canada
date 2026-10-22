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
import { portalLogin, portalPage } from '../pages/portal.js';

export const cleanPath = (pathname) => (pathname.length > 1 ? pathname.replace(/\/$/, '') : '/');

export function needs(path) {
  if (path === '/' || path === '/blog') return 'posts';
  if (path.startsWith('/blog/')) return { post: decodeURIComponent(path.split('/')[2] || '') };
  if (path.startsWith('/referral-portal/')) return { portal: decodeURIComponent(path.split('/')[2] || '') };
  return null;
}

export function pageFor(path, q, loaded = null) {
  let html = '', title = TITLES[path];
  if (path === '/') html = home();
  else if (path === '/about') html = about();
  else if (path === '/already-in-canada') html = already(q);
  else if (path === '/book-consultation') html = book(q);
  else if (path === '/partner-with-us') html = partner();
  else if (path === '/contact') html = contact();
  else if (path === '/blog') html = blog();
  else if (path === '/referral-portal') html = portalLogin();
  else if (path.startsWith('/blog/')) {
    if (loaded) { html = post(loaded); title = loaded.title + ' | UGEC Canada'; }
  } else if (path.startsWith('/referral-portal/')) {
    if (loaded) { html = portalPage(loaded); title = 'Your referrals | UGEC Canada'; }
    else return { found: false, title: 'Link not valid | UGEC Canada', html: portalLogin('This link is not valid any more. Enter your email below and we will send you your current link, or contact UGEC Canada.') };
  } else if (path.startsWith('/programs/')) {
    const p = find(path.split('/')[2]);
    if (p) { html = programPage(p); title = `${p.name} (${p.province}) | UGEC Canada`; }
  } else if (path.startsWith('/legal/')) {
    const l = legal(path.split('/')[2]); if (l) { html = l.html; title = l.title; }
  }
  if (!html) return { found: false, title: 'Page not found | UGEC Canada', html: t('components/page-head', { title: 'Page not found', lede: 'That page does not exist. Use the menu to find what you need.' }) };
  return { found: true, title, html };
}
