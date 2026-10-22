import { S } from '../core/state.js';
import { t } from '../core/tpl.js';

export const about = () => t('pages/about', {
  team: S.site.team.map((m) => ({ name: m.name, role: m.role, photo: m.photo || '', initials: m.name.split(' ').map((x) => x[0]).slice(0, 2).join('') })),
});
