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

const LINES = (n, l, extra = {}) => ({ n, l, t: 'lines', ...extra });
module.exports.settingsFields = [
  H('Contact & social', 'Shown in the footer and on the Contact page, and used for the WhatsApp buttons.'),
  T('tagline', 'Tagline'), T('location', 'Location', { h: 'For example: Halifax, Nova Scotia, Canada' }),
  T('contact_email', 'Contact email', { h: 'Shown on the site. New-lead emails go here too, unless a form has its own address.' }),
  T('phone_display', 'Phone number shown on the site'),
  T('phone_raw', 'WhatsApp number', { h: 'Digits only, with the country code. For example: 17822340211' }),
  T('facebook_url', 'Facebook page'), T('instagram_url', 'Instagram page'), T('tiktok_url', 'TikTok page'),

  H('Immigration & booking', 'Used on the booking page and the Immigration Assistance page.'),
  T('stripe_url', 'Payment link for immigration consultations', { h: 'The Stripe link people open to book and pay.' }),
  T('rcic_name', 'Immigration consultant\'s name'), T('rcic_title', 'Their title', { h: 'For example: Regulated Canadian Immigration Consultant (RCIC)' }),
  T('rcic_licence', 'Licence number', { h: 'The consultant\'s CICC licence number (starts with R). Shown next to their name.' }),

  H('Logo & photos', 'Pick an image, then move, zoom and crop it before it is saved.'),
  { n: 'logo', l: 'Logo', h: 'Shown in the header and footer on every page. A PNG with a see-through background works best.', t: 'image', folder: 'site', shapes: ['free', 'circle', 'square', 'wide'], max: 800, format: 'png' },
  { n: 'logo_height', l: 'Logo size in the header', t: 'range', min: 28, max: 96, step: 2, unit: 'px', def: 44, preview: 'logo' },
  CB('logo_box', 'Put a white box behind the logo on dark backgrounds', { h: 'Turn on only if the logo is hard to see on dark blue.' }),
  { n: 'logo_dark', l: 'Logo for dark backgrounds', h: 'Optional. Used in the footer; without it the main logo is used.', t: 'image', folder: 'site', shapes: ['free', 'circle', 'square', 'wide'], max: 800, format: 'png' },
  { n: 'site_icon', l: 'Site icon', h: 'The small picture in the browser tab and on phone home screens. Square, 512 x 512 or larger.', t: 'image', folder: 'site', shapes: ['square', 'circle'], max: 512, format: 'png' },
  { n: 'share_image', l: 'Link preview image', h: 'Shown when the site is shared on WhatsApp, Facebook or LinkedIn. Without it the hero photo or logo is used.', t: 'image', folder: 'site', shapes: ['share', 'free'], max: 1200 },
  { n: 'hero_image', l: 'Home page photo', h: 'Optional. Replaces the "free consultation" box at the top of the home page.', t: 'image', folder: 'site', shapes: ['free', 'landscape', 'square'], max: 1800 },
  { n: 'about_image', l: 'About page photo', h: 'Optional. Shown beside the introduction on the About page.', t: 'image', folder: 'site', shapes: ['free', 'landscape', 'portrait', 'square'], max: 1600 },

  H('Home page', 'Program category descriptions, frequently asked questions and client stories.'),
  { n: 'category_info', l: 'Program category descriptions', h: 'The short line under each program category.', t: 'map', keyLabel: 'Category', valueLabel: 'Description', add: 'Add a category', suggest: 'category' },
  LIST('faq', 'Frequently asked questions', [T('q', 'Question'), TA('a', 'Answer', { rows: 3 })], { add: 'Add a question', titleFrom: 'q' }),
  LIST('testimonials', 'Client stories', [T('name', 'Name'), T('detail', 'Detail, e.g. "PSW student, Ontario"'), TA('text', 'What they said', { rows: 3 })], { add: 'Add a story', titleFrom: 'name', h: 'Real stories only. The section is hidden while there are none.' }),

  H('Page text', 'The wording of the Educational Assistance and Immigration Assistance pages, and the disclaimer in the footer.'),
  { t: 'subheading', l: 'Educational Assistance page' },
  TA('edu_lede', 'Introduction', { rows: 3 }),
  LIST('edu_pathways', 'What we can help with', [T('title', 'Title'), TA('text', 'Description', { rows: 2 })], { add: 'Add an item', titleFrom: 'title' }),
  TA('edu_dli_text', 'Programs across Canada', { rows: 2 }),
  LINES('edu_levels', 'Program levels', { h: 'One per line.' }),
  { t: 'subheading', l: 'Immigration Assistance page' },
  TA('imm_lede', 'Introduction', { rows: 2 }),
  LINES('imm_filing', 'Application filing services', { h: 'One per line.' }),
  LINES('imm_study', 'Study permit filing services', { h: 'One per line.' }),
  TA('imm_dli_text', 'Note under the study permit list', { rows: 2 }),
  TA('imm_disclaimer', 'Disclaimer', { rows: 3, h: 'The consultant\'s name, title and licence number are added after it automatically.' }),
  { t: 'subheading', l: 'Every page' },
  TA('site_disclaimer', 'Footer disclaimer', { rows: 4 }),

  H('Announcement & emails', 'The bar at the top of every page, and the confirmation email people get.'),
  CB('announcement_active', 'Show the announcement bar'), T('announcement', 'Announcement text'),
  CB('confirm_email', 'Email a "we received your request" confirmation to people who send a form', { h: 'Needs email to be working (see the status above).' }),
];
