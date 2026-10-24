import { S } from '../core/state.js';
import { BOOKING } from '../core/config.js';
import { find } from '../core/util.js';
import { t } from '../core/tpl.js';
import { formView } from '../components/form.js';

export function book(q) {
  let key = q.get('type'); if (!BOOKING.some((x) => x.key === key)) key = S.bookType || 'educational';
  S.bookType = key;
  const type = BOOKING.find((x) => x.key === key), pr = find(q.get('program'));
  const pre = { ...(S.bookPre || {}) };
  if (pr) pre.interest = `${pr.name} (${pr.province})`;
  return t('pages/book', {
    types: BOOKING.map((o) => ({ ...o, selected: o.key === key })),
    is: { [key]: true }, // is.educational or is.immigration
    form: formView(type.form, pre, type.submit),
  });
}
