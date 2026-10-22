import { LEGAL } from '../core/config.js';
import { t } from '../core/tpl.js';

export function legal(k) {
  if (!LEGAL[k]) return null;
  return { title: LEGAL[k] + ' | UGEC Canada', html: t('pages/legal', { title: LEGAL[k], body: t('legal/' + k) }) };
}
