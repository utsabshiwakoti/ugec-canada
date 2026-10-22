import { S } from '../core/state.js';
import { fmtDate, paras } from '../core/util.js';
import { t } from '../core/tpl.js';

export const blog = () => t('pages/blog', { posts: S.posts.map((p) => ({ ...p, date: fmtDate(p.published_at) })) });

export const post = (p) => t('pages/post', { ...p, date: fmtDate(p.published_at), paragraphs: paras(p.body) });
