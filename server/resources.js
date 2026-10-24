const T = (n, l, extra = {}) => ({ n, l, t: 'text', ...extra });
const TA = (n, l, extra = {}) => ({ n, l, t: 'textarea', ...extra });
const CB = (n, l, extra = {}) => ({ n, l, t: 'checkbox', ...extra });
const NUM = (n, l, extra = {}) => ({ n, l, t: 'number', ...extra });
const H = (l, hint = '') => ({ t: 'heading', l, hint });
const LIST = (n, l, item, extra = {}) => ({ n, l, t: 'list', item, ...extra });

const FORM_FIELD = [
  T('l', 'Label (what the visitor sees)'),
  { n: 't', l: 'Type of answer', t: 'select', o: [['text', 'Short text'], ['email', 'Email address'], ['tel', 'Phone number'], ['date', 'Date'], ['textarea', 'Long text (several lines)'], ['select', 'Dropdown list']] },
  CB('r', 'Required (the form cannot be sent without it)'),
  { n: 'o', l: 'Dropdown choices', t: 'choices', showIf: ['t', 'select'] },
  T('n', 'Saved as (internal name, filled in for you; keep name, email, phone and interest as they are)', { small: 1 }),
];

module.exports = {
  programs: {
    label: 'Programs', table: 'programs', id: 'id', order: 'sort, name', list: ['name', 'province', 'category', 'fees', 'published'],
    fields: [
      T('name', 'Program name', { r: 1 }), T('slug', 'URL slug (auto from name if blank)'),
      T('category', 'Category', { r: 1, suggest: 1 }), T('province', 'Province', { r: 1, suggest: 1 }), T('campus', 'Campus'),
      { n: 'provider_id', l: 'College / training provider', t: 'ref', ref: 'providers' },
      T('duration', 'Duration'), T('delivery', 'Delivery format'), T('intake', 'Next intake'),
      T('fees', 'Tuition and other fees'), TA('admission', 'Admission requirements'), T('english', 'English-language requirements'),
      TA('placement', 'Co-op / placement'), T('credential', 'Credential awarded'), TA('career', 'Career information'),
      TA('suitable', 'Who it may suit'), T('pathways', 'Pathways it may be relevant to'), TA('guarantee', 'Provider guarantee (exact wording)'),
      TA('notes', 'Notes shown on the page'),
      CB('coming_soon', 'Details coming soon'), CB('published', 'Published'), NUM('sort', 'Sort order'),
    ],
  },
  partners: {
    label: 'Referral partners', table: 'referral_partners', id: 'id', order: 'name', list: ['name', 'code', 'listed', 'active'],
    fields: [
      T('name', 'Partner name', { r: 1 }), T('code', 'Referral code (auto from name if blank)'),
      T('email', 'Email (they sign in to the referral partner portal with this)'), T('phone', 'Phone'), TA('commission_terms', 'Commission terms (internal)'),
      CB('listed', 'Show in the "Who referred you?" list on the website'), CB('active', 'Active (accepts new referrals)'),
      CB('portal_enabled', 'Can sign in to the referral partner portal (untick to remove their access; they are signed out at once)'),
      TA('notes', 'Internal notes'),
    ],
  },
  providers: {
    label: 'Colleges / providers', table: 'providers', id: 'id', order: 'name', list: ['name', 'province', 'website'],
    fields: [T('name', 'Name', { r: 1 }), T('website', 'Website'), T('province', 'Province', { suggest: 1 }), TA('notes', 'Internal notes')],
  },
  posts: {
    label: 'Blog', table: 'posts', id: 'id', order: 'published_at DESC', list: ['title', 'category', 'published_at', 'published'],
    fields: [
      T('title', 'Title', { r: 1 }), T('slug', 'URL slug (auto from title if blank)'), T('category', 'Category', { suggest: 1 }),
      T('summary', 'Short summary'), TA('body', 'Body (blank line between paragraphs)', { rows: 12 }),
      { n: 'published_at', l: 'Date (use the update date for immigration posts)', t: 'date', r: 1 }, CB('published', 'Published'),
    ],
  },
  team: {
    label: 'Team', table: 'team', id: 'id', order: 'sort, id', list: ['photo', 'name', 'role', 'visible'],
    fields: [T('name', 'Name', { r: 1 }), T('role', 'Role', { r: 1 }), { n: 'photo', l: 'Photo', t: 'image', folder: 'team', shapes: ['square'], max: 600 }, NUM('sort', 'Sort order'), CB('visible', 'Visible')],
  },
  forms: {
    label: 'Forms', table: 'forms', id: 'type', idEditable: true, order: 'type', list: ['type', 'title', 'enabled'],
    fields: [
      T('type', 'Form key (letters, numbers, dashes)', { r: 1 }), T('title', 'Title', { r: 1 }), CB('enabled', 'Accepting submissions'),
      T('notify_email', 'Email new leads to (optional, needs SMTP)'),
      LIST('fields', 'Questions on this form', FORM_FIELD, { add: 'Add a question', titleFrom: 'l' }),
    ],
  },
};

module.exports.settingsFields = [
  H('Contact details', 'Shown in the footer, on the Contact page and used for WhatsApp buttons.'),
  T('tagline', 'Tagline'), T('location', 'Location'), T('contact_email', 'Contact email'),
  T('phone_display', 'Phone shown on site'), T('phone_raw', 'WhatsApp number (digits only, with country code, e.g. 17822340211)'),
  T('facebook_url', 'Facebook page link'), T('instagram_url', 'Instagram page link'), T('tiktok_url', 'TikTok page link'),
  H('Immigration consultation', 'Shown on the immigration booking page.'),
  T('stripe_url', 'Booking and payment link (Stripe)'),
  T('rcic_name', 'Immigration professional name'), T('rcic_title', 'Immigration professional title'), T('rcic_licence', 'Licence number'),
  H('Announcement and emails'),
  CB('announcement_active', 'Show the announcement bar at the top of every page'), T('announcement', 'Announcement text'),
  CB('confirm_email', 'Email a "we received your request" confirmation to people who send a form (needs email set up)'),
  H('Logo and photos'),
  { n: 'logo', l: 'Logo (shown in the header and footer on every page; a PNG with a transparent background works best)', t: 'image', folder: 'site', shapes: ['free', 'circle', 'square', 'wide'], max: 800, format: 'png' },
  { n: 'logo_height', l: 'Logo size in the header', t: 'range', min: 28, max: 96, step: 2, unit: 'px', def: 44, preview: 'logo' },
  { n: 'logo_dark', l: 'Logo for dark backgrounds (optional, used in the footer; without it the main logo is shown on a white badge)', t: 'image', folder: 'site', shapes: ['free', 'circle', 'square', 'wide'], max: 800, format: 'png' },
  { n: 'site_icon', l: 'Site icon (the small picture in the browser tab and on phone home screens; square, 512 x 512 or larger)', t: 'image', folder: 'site', shapes: ['square', 'circle'], max: 512, format: 'png' },
  { n: 'share_image', l: 'Link preview image (shown when the site is shared on WhatsApp, Facebook or LinkedIn; 1200 x 630 works best). Without it the hero photo or logo is used.', t: 'image', folder: 'site', shapes: ['share', 'free'], max: 1200 },
  { n: 'hero_image', l: 'Home page hero photo (optional; replaces the "free consultation" box)', t: 'image', folder: 'site', shapes: ['free', 'landscape', 'square'], max: 1800 },
  { n: 'about_image', l: 'About page photo (optional; shown beside the introduction)', t: 'image', folder: 'site', shapes: ['free', 'landscape', 'portrait', 'square'], max: 1600 },
  H('Home page content'),
  { n: 'category_info', l: 'Category descriptions (the short line under each program category)', t: 'map', keyLabel: 'Category', valueLabel: 'Description', add: 'Add a category', suggest: 'category' },
  LIST('faq', 'Frequently asked questions', [T('q', 'Question'), TA('a', 'Answer', { rows: 3 })], { add: 'Add a question', titleFrom: 'q' }),
  LIST('testimonials', 'Client stories (real ones only; the section is hidden when there are none)', [T('name', 'Name'), T('detail', 'Detail, e.g. "PSW student, Ontario"'), TA('text', 'What they said', { rows: 3 })], { add: 'Add a story', titleFrom: 'name' }),
];
