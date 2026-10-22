import { S } from './state.js';

export const $ = (s, r = document) => r.querySelector(s);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const api = async (p, opt) => { const r = await fetch(p, opt); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; };

export const cfg = () => S.site.settings;

export const WA = (t = '') => `https://wa.me/${cfg().phoneRaw}${t ? '?text=' + encodeURIComponent(t) : ''}`;

export const uniq = (list, k) => [...new Set(list.map((p) => p[k]).filter(Boolean))];

export const find = (slug) => S.programs.find((p) => p.slug === slug);

export const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

export const TBC = 'Confirm with UGEC';

export const paras = (t) => String(t || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);

export const bookHref = (type, program) => `/book-consultation?type=${type}${program ? '&program=' + encodeURIComponent(program) : ''}`;
