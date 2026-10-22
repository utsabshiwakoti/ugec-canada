import { TBC, bookHref } from '../core/util.js';

export function programView(p) {
  const soon = p.coming_soon ? 'Coming soon' : TBC;
  return {
    slug: p.slug, name: p.name, province: p.province, category: p.category, guarantee: p.guarantee || '',
    bookHref: bookHref(p.category === 'Skilled trades' ? 'trades' : 'educational', p.slug),
    rows: p.coming_soon
      ? [{ label: 'Status', value: 'Details coming soon' }]
      : [{ label: 'Duration', value: p.duration || TBC }, { label: 'Fees', value: p.fees || TBC }, { label: 'Delivery', value: p.delivery || p.placement || TBC }],
    table: { duration: p.duration || soon, fees: p.fees || soon, placement: p.placement || p.delivery || '', pathways: p.pathways || '' },
  };
}
