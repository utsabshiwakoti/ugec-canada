const db = require('./db');

const SITE_NAME = 'UGEC Canada';
const PAGES = {
  '/': ['UGEC Canada | Education & Career Opportunities in Canada', 'UGEC Canada helps students explore Canadian education, career-focused programs and practical opportunities. Halifax, Nova Scotia.'],
  '/about': ['About UGEC Canada | Education Consultancy in Halifax', 'Meet the UGEC Canada team. A Halifax-based education consultancy helping students explore Canadian programs.'],
  '/pr-leading-courses': ['PR-Leading Courses in Canada | UGEC Canada', 'Already in Canada? Compare healthcare, childcare and skilled-trades programs by province, fees, duration and placement, with next steps for your situation.'],
  '/educational-assistance': ['Educational Assistance: Study Permit Pathways | UGEC Canada', 'PGWP, LMIA and SOWP to study permit, and SOWP-eligible programs. Master’s, undergraduate diploma and bachelor’s programs at public DLIs across Canada.'],
  '/immigration-assistance': ['Professional Immigration Assistance | UGEC Canada', 'PGWP, SOWP, PR, PNP, RCIP, AIP and study permit filing, with a Regulated Canadian Immigration Consultant (RCIC).'],
  '/book-consultation': ['Book a Consultation | UGEC Canada', 'Book a free educational consultation about PR-leading courses, or a paid immigration consultation with an RCIC.'],
  '/partner-with-us': ['Partner With UGEC Canada | Colleges & Training Providers', 'Education and training providers: partner with UGEC Canada to connect suitable students with career-focused programs.'],
  '/blog': ['Blog & Updates | UGEC Canada', 'Study in Canada guides, program updates, skilled trades and education planning from UGEC Canada.'],
  '/contact': ['Contact UGEC Canada | Halifax, Nova Scotia', 'Contact UGEC Canada by email, phone or WhatsApp, or send an inquiry online.'],
  '/referral-portal': ['Referral partner portal | UGEC Canada', 'Referral partners of UGEC Canada: sign in to see the people you have referred and how they are progressing.'],
};
const LEGAL = { privacy: 'Privacy Policy', terms: 'Terms & Conditions', cookies: 'Cookie Policy', disclaimer: 'Disclaimer', accessibility: 'Accessibility' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const base = () => (process.env.SITE_URL || '').replace(/\/$/, '');

async function images(origin) {
  const s = await db.getSettings();
  const abs = (u) => (u && u.startsWith('/') ? (base() || origin || '') + u : u);
  const icon = s.site_icon || '/favicon.svg';
  const share = s.share_image || s.hero_image || s.logo || '';
  return {
    icon,
    html: `<link rel="icon" href="${esc(icon)}"${icon.endsWith('.svg') ? ' type="image/svg+xml"' : ''}>` +
      (s.site_icon ? `<link rel="apple-touch-icon" href="${esc(s.site_icon)}">` : '') +
      (share ? `<meta property="og:image" content="${esc(abs(share))}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'),
  };
}

async function metaFor(pathname, origin = '') {
  const p = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  let title, desc, ld = null, hidden = false;
  if (PAGES[p]) {
    [title, desc] = PAGES[p];
    if (p === '/') ld = { '@context': 'https://schema.org', '@type': 'EducationalOrganization', name: SITE_NAME, url: base() || undefined,
      email: 'kedar.dhungana@ugec.ca', telephone: '+1 782 234 0211', address: { '@type': 'PostalAddress', addressLocality: 'Halifax', addressRegion: 'NS', addressCountry: 'CA' } };
  } else if (p.startsWith('/programs/')) {
    const r = await db.get('SELECT name, province, fees FROM programs WHERE slug=? AND published=1', p.split('/')[2]);
    if (r) { title = `${r.name} (${r.province}) | ${SITE_NAME}`; desc = `${r.name} in ${r.province}: duration, fees, placement and how to apply through UGEC Canada.`; }
  } else if (p.startsWith('/blog/')) {
    const r = await db.get('SELECT title, summary FROM posts WHERE slug=? AND published=1', p.split('/')[2]);
    if (r) { title = `${r.title} | ${SITE_NAME}`; desc = r.summary || r.title; }
  } else if (p.startsWith('/referral-portal/set-password/')) {
    title = `Set your password | ${SITE_NAME}`; desc = ''; hidden = true;
  } else if (p.startsWith('/legal/') && LEGAL[p.split('/')[2]]) {
    title = `${LEGAL[p.split('/')[2]]} | ${SITE_NAME}`; desc = `${LEGAL[p.split('/')[2]]} for UGEC Canada.`;
  }
  const known = !!title;
  title = title || `Page not found | ${SITE_NAME}`;
  desc = desc || '';
  const canonical = base() ? `<link rel="canonical" href="${esc(base() + p)}"><meta property="og:url" content="${esc(base() + p)}">` : '';
  const og = `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${SITE_NAME}">`;
  const ldTag = ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '';
  const robots = known && !hidden ? '' : '<meta name="robots" content="noindex">';
  return { known, private: hidden, html: `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">${canonical}${og}${(await images(origin)).html}${robots}${ldTag}` };
}

async function sitemap() {
  const b = base();
  const urls = [...Object.keys(PAGES), ...Object.keys(LEGAL).map((k) => `/legal/${k}`)];
  (await db.all('SELECT slug FROM programs WHERE published=1')).forEach((r) => urls.push(`/programs/${r.slug}`));
  (await db.all('SELECT slug FROM posts WHERE published=1')).forEach((r) => urls.push(`/blog/${r.slug}`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(b + u)}</loc></url>`).join('\n')}\n</urlset>`;
}

module.exports = { metaFor, sitemap, siteIcon: async () => (await images()).icon };
