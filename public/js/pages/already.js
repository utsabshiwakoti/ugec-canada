import { S } from '../core/state.js';
import { uniq } from '../core/util.js';
import { t } from '../core/tpl.js';
import { chipList } from '../components/chips.js';
import { programView } from '../components/program-list.js';

export function already(q) {
  if (q.get('cat')) S.sCat = q.get('cat');
  const pool = S.programs;
  const list = pool.filter((p) => (S.sProv === 'All' || p.province === S.sProv) && (S.sCat === 'All' || p.category === S.sCat));
  return t('pages/already', {
    provinces: chipList(['All', ...uniq(pool, 'province')], S.sProv),
    categories: chipList(['All', ...uniq(pool, 'category')], S.sCat),
    views: chipList(['cards', 'table'], S.view),
    tableView: S.view === 'table',
    programs: list.map(programView),
  });
}
