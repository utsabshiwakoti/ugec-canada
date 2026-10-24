import { fmtDate } from '../core/util.js';
import { globals, t } from '../core/tpl.js';

const STEPS = [['new', 'Received'], ['contacted', 'Contacted'], ['consultation booked', 'Consultation booked'], ['applied', 'Applied'], ['enrolled', 'Enrolled']];
const COMMISSION = { pending: 'Commission pending', approved: 'Commission approved', paid: 'Commission paid', void: 'No commission' };
const money = (n) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const portalLogin = (notice = '') => t('pages/portal-login', { notice });

export const setPasswordPage = (code, info) => t('pages/set-password', { code, ...info });

export function portalPage(d) {
  const link = `${globals.origin}/?ref=${encodeURIComponent(d.partner.code)}`;
  const refs = d.referrals.map((r) => {
    const at = STEPS.findIndex(([k]) => k === r.status);
    return {
      ...r, dateLabel: fmtDate(r.date), closed: at < 0,
      stage: at < 0 ? 'Closed' : STEPS[at][1],
      steps: STEPS.map(([, label], i) => ({ label, done: at >= 0 && i <= at, current: i === at })),
      commissionLabel: COMMISSION[r.commission] || '', amountLabel: r.amount && r.commission !== 'void' ? money(r.amount) : '',
      commissionClass: r.commission === 'paid' ? 'ok' : r.commission === 'void' ? 'off' : '',
    };
  });
  const sum = (status) => d.referrals.filter((r) => r.commission === status).reduce((a, r) => a + r.amount, 0);
  return t('pages/portal', {
    partner: d.partner, link,
    waShare: 'https://wa.me/?text=' + encodeURIComponent(`Thinking about studying or training in Canada? UGEC Canada can help you find the right program: ${link}`),
    refs,
    total: refs.length,
    inProgress: refs.filter((r) => !r.closed && r.status !== 'enrolled').length,
    enrolled: refs.filter((r) => r.status === 'enrolled').length,
    paid: money(sum('paid')), owed: money(sum('approved')), pending: money(sum('pending')),
    hasCommission: d.referrals.some((r) => ['pending', 'approved', 'paid'].includes(r.commission)),
  });
}
