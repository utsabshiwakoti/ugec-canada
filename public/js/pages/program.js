import { WA, bookHref } from '../core/util.js';
import { t } from '../core/tpl.js';

const SUITS = { Healthcare: 'People who want a hands-on career in health and care settings.', Childcare: 'People who enjoy working with children and families.', 'Skilled trades': 'People who prefer practical, hands-on work.' };

export function programPage(p) {
  const details = [
    ['College / training provider', p.provider], ['Province and campus', p.province + (p.campus ? ', ' + p.campus : '')],
    ['Program duration', p.duration], ['Delivery format', p.delivery], ['Next intake', p.intake],
    ['Tuition and other fees', p.fees], ['Admission requirements', p.admission], ['English-language requirements', p.english],
    ['Co-op / placement', p.placement], ['Credential awarded', p.credential], ['Career information', p.career],
    ['Who it may suit', p.suitable || SUITS[p.category] || ''],
    ['Application process', 'Book a consultation, and UGEC guides you through admission and submits your application to the institution.'],
  ];
  if (p.pathways) details.push(['Pathways it may be relevant to', p.pathways + '. Eligibility depends on your own circumstances.']);
  if (p.guarantee) details.push(['Provider guarantee', p.guarantee]);
  if (p.notes) details.push(['Note', p.notes]);
  return t('pages/program', {
    name: p.name, province: p.province, category: p.category, comingSoon: !!p.coming_soon,
    bookHref: bookHref(p.category === 'Skilled trades' ? 'trades' : 'educational', p.slug),
    waHref: WA(`Hi UGEC, I have a question about ${p.name} (${p.province}).`),
    details: details.map(([label, value]) => ({ label, value: value || '' })),
  });
}
