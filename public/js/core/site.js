import { S, resetState } from './state.js';
import { BOOKING, DISCLAIMER } from './config.js';
import { WA, bookHref } from './util.js';
import { globals } from './tpl.js';

export function initSite(site, programs, posts = null, origin = '') {
  resetState();
  S.site = site; S.programs = programs; S.posts = posts;
  Object.assign(globals, {
    site: site.settings,
    booking: BOOKING.map((b) => ({ ...b, href: bookHref(b.key) })),
    waGeneral: WA('Hi UGEC, I would like to ask about programs.'),
    waQuestion: WA('Hi UGEC, I have a question.'),
    disclaimer: DISCLAIMER,
    year: new Date().getFullYear(),
    origin,
  });
}
