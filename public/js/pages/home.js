import { S } from '../core/state.js';
import { cfg, fmtDate, uniq } from '../core/util.js';
import { t } from '../core/tpl.js';

export function home() {
  const c = cfg(), info = c.categoryInfo || {};
  const stories = (c.testimonials || []).length > 0, faqs = (c.faq || []).length > 0;
  return t('pages/home', {
    liveCount: S.programs.filter((p) => !p.coming_soon).length,
    provinceCount: uniq(S.programs, 'province').length,
    categories: uniq(S.programs, 'category').map((name) => {
      const n = S.programs.filter((p) => p.category === name).length;
      return { name, letter: name[0], info: info[name] || '', countLabel: `${n} program${n === 1 ? '' : 's'}`, href: `/already-in-canada?cat=${encodeURIComponent(name)}` };
    }),
    posts: (S.posts || []).slice(0, 3).map((p) => ({ ...p, date: fmtDate(p.published_at) })),
    faqClass: stories ? '' : 'alt',
    postsClass: (faqs ? stories : !stories) ? 'alt' : '',
  });
}
