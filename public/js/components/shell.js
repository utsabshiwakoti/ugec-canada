import { $, WA, cfg } from '../core/util.js';
import { S } from '../core/state.js';
import { LEGAL, NAV, NAV_LINKS } from '../core/config.js';
import { t } from '../core/tpl.js';

export function shellParts(path) {
  const c = cfg();
  const cur = path.startsWith('/programs/') ? '/pr-leading-courses' : path.startsWith('/blog/') ? '/blog' : path;
  const link = ([href, label]) => ({ href, label, current: href === cur });
  return {
    brand: t('components/brand', { logo: c.logo, badge: false, box: c.logoBox, height: c.logoHeight, dark: c.logoDark }),
    banner: c.announcement && !S.bannerOff ? t('components/banner', { text: c.announcement }) : '',
    nav: t('components/nav', {
      links: NAV.map(([a, b]) => (Array.isArray(b) ? { label: a, children: b.map(link), current: b.some(([href]) => href === cur) } : link([a, b]))),
    }),
    hbook: t('components/bookmenu', { label: 'Book Consultation', cls: '' }),
    abar: t('components/actionbar'),
    waf: WA('Hi UGEC, I would like to ask about programs.'),
    foot: t('components/footer', {
      company: [...NAV_LINKS.slice(1), ['/referral-portal', 'Referral partner portal']].map(([href, label]) => ({ href, label })),
      legal: Object.entries(LEGAL).map(([k, label]) => ({ href: `/legal/${k}`, label })),
    }),
  };
}

export function shell(path) {
  const p = shellParts(path);
  for (const id of ['brand', 'banner', 'nav', 'hbook', 'abar', 'foot']) $('#' + id).innerHTML = p[id];
  $('#waf').href = p.waf;
}

export const closeMenus = () => document.querySelectorAll('.bm-list').forEach((m) => { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); });
