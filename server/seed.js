const db = require('./db');
const { hashPassword } = require('./auth');

const settings = {
  tagline: 'Connecting Ambition With Opportunity.',
  location: 'Halifax, Nova Scotia, Canada',
  contact_email: 'kedar.dhungana@ugec.ca',
  phone_display: '+1 782 234 0211',
  phone_raw: '17822340211',
  stripe_url: 'https://buy.stripe.com/fZu4gy1CL7Mz2x86g16Zy00',
  rcic_name: 'Vimal Kumar',
  rcic_title: 'Regulated Canadian Immigration Consultant (RCIC)',
  rcic_licence: '',
  announcement_active: '1',
  announcement: 'Intakes and availability change often. Message us on WhatsApp for current dates.',
  hero_image: '',
  about_image: '',
  testimonials: '[]',
  faq: JSON.stringify([
    {
      "q": "What does UGEC Canada do?",
      "a": "We help students and individuals explore Canadian education and career-focused programs. Our services include program and college selection, application and document support, follow-up with institutions, and guidance for people already in Canada."
    },
    {
      "q": "Do you guarantee admission, a visa or PR?",
      "a": "No. UGEC does not guarantee admission, visas, work permits, permanent residence or employment. Decisions are made by the institutions and by the Government of Canada. Our role is to help you prepare and understand your options."
    },
    {
      "q": "Is the educational consultation free?",
      "a": "Yes. The educational consultation is free. The immigration consultation is a paid booking with an authorized immigration professional."
    },
    {
      "q": "Who gives immigration advice?",
      "a": "Regulated immigration advice is provided only by an appropriately authorized professional. UGEC can connect you with one where regulated advice is required."
    },
    {
      "q": "Are the fees and intakes on the website final?",
      "a": "Fees, admission requirements and intakes can change. UGEC confirms current details with the institution, and the institution is the final source."
    },
    {
      "q": "I am already in Canada. Can you help?",
      "a": "Yes. We have programs in several provinces for people already in Canada. Tell us your current situation and goals, and we will suggest suitable options."
    },
    {
      "q": "How do I get started?",
      "a": "Book a free educational consultation or message us on WhatsApp. We will discuss your goals, review admission requirements and explain the next steps."
    }
  ], null, 2),
  category_info: JSON.stringify({
    'Healthcare': 'Career-focused programs in personal support, continuing care, health care assistance and pharmacy.',
    'Childcare': 'Early childhood education programs with placements.',
    'Skilled trades': 'Gas, HVAC, plumbing, carpentry, welding and more in Ontario. Details coming soon.',
  }, null, 2),
};

const P = (slug, name, category, province, o = {}) => ({ slug, name, category, province, ...o });
const programs = [
  P('psw-ontario', 'NACC-approved Personal Support Worker (PSW)', 'Healthcare', 'Ontario', {
    duration: '6 months', fees: '$6,000 (instalments)', delivery: 'Live online plus recordings; morning and evening batches',
    placement: '300 hours, arranged by the college across Ontario', pathways: 'OINP, Express Entry and other PNPs', credential: 'PSW certificate' }),
  P('psw-new-brunswick', 'NACC-approved Personal Support Worker (PSW)', 'Healthcare', 'New Brunswick', {
    duration: '8 months', fees: '$14,000 to $15,000', notes: 'A study permit is needed. Students on a PGWP must apply for one.', credential: 'PSW certificate' }),
  P('cca-nova-scotia', 'Continuing Care Assistant (CCA)', 'Healthcare', 'Nova Scotia', {
    fees: '$14,000 to $17,000 (instalments)', delivery: 'In person; attendance mandatory', pathways: 'Nova Scotia graduate PNP and Express Entry',
    guarantee: 'Money-back guarantee if you do not get a job within 6 months of graduation (conditions apply)', credential: 'CCA certificate' }),
  P('hca-british-columbia', 'Health Care Assistant (HCA)', 'Healthcare', 'British Columbia', {
    fees: '$8,500 to $10,000 (instalments)', delivery: 'Attendance mandatory', pathways: 'BC PNP and Express Entry', credential: 'HCA certificate' }),
  P('pharmacy-assistant-ontario', 'Pharmacy Assistant', 'Healthcare', 'Ontario', {
    duration: '3 months', fees: '$4,000 including a 1-month internship', placement: '160 hours, arranged by the college', credential: 'Pharmacy Assistant certificate' }),
  P('pharmacy-technician-nova-scotia', 'Pharmacy Technician', 'Healthcare', 'Nova Scotia', {
    duration: 'Nearly 1 year', fees: '$26,000', admission: 'Grade 11 Math, Biology and Chemistry',
    pathways: 'Nova Scotia graduate PNP and Express Entry', credential: 'Pharmacy Technician diploma' }),
  P('ece-nova-scotia', 'Early Childhood Education (ECE)', 'Childcare', 'Nova Scotia', {
    fees: '$16,000 to $17,000', delivery: 'Attendance mandatory', placement: 'Paid placements',
    pathways: 'Nova Scotia graduate PNP and Express Entry', credential: 'ECE diploma' }),
  P('ecea-ontario', 'Early Childhood Education Assistant (ECEA)', 'Childcare', 'Ontario', {
    fees: '$5,000 to $6,500', placement: '160 hours (1 month), arranged by the college across Ontario',
    guarantee: 'Money-back guarantee if you do not get a job within 90 days of graduation (conditions apply)', credential: 'ECEA certificate' }),
  ...[['gas-technician-ontario', 'Gas Technician (G3 / G2)'], ['hvac-ontario', 'HVAC programs'], ['plumbing-ontario', 'Plumbing / Pre-Apprenticeship'],
    ['carpentry-ontario', 'Carpentry / Construction'], ['welding-ontario', 'Welding and other skilled-trades programs']]
    .map(([s, n], i) => P(s, n, 'Skilled trades', 'Ontario', { coming_soon: 1, sort: 100 + i })),
];

const COMMON = [
  { n: 'name', l: 'Full name', t: 'text', r: 1 }, { n: 'email', l: 'Email', t: 'email', r: 1 },
  { n: 'phone', l: 'Phone / WhatsApp', t: 'tel', r: 1 }, { n: 'location', l: 'Your location (city, country)', t: 'text' },
];
const TAIL = [
  { n: 'message', l: 'Message', t: 'textarea' },
  { n: 'method', l: 'Preferred contact method', t: 'select', o: ['WhatsApp', 'Email', 'Phone call'] },
];
const forms = [
  ['general', 'General inquiry', [...COMMON, { n: 'interest', l: 'What are you interested in?', t: 'text' }, ...TAIL]],
  ['educational', 'Educational consultation', [...COMMON, { n: 'interest', l: 'Program of interest', t: 'select', o: '@programs' },
    { n: 'time', l: 'Preferred consultation time', t: 'text' }, ...TAIL]],
  ['already', 'Already in Canada', [...COMMON, { n: 'status', l: 'Current status in Canada', t: 'text' },
    { n: 'interest', l: 'Program or province of interest', t: 'text' }, ...TAIL]],
  ['trades', 'Skilled trades inquiry', [...COMMON, { n: 'interest', l: 'Trade of interest', t: 'select', o: '@trades' }, ...TAIL]],
  ['immigration', 'Immigration consultation intake', [
    { n: 'name', l: 'Full name', t: 'text', r: 1 }, { n: 'email', l: 'Email', t: 'email', r: 1 }, { n: 'phone', l: 'Phone / WhatsApp', t: 'tel', r: 1 },
    { n: 'country', l: 'Current country', t: 'text', r: 1 }, { n: 'status', l: 'Current status in Canada (if any)', t: 'text' },
    { n: 'expiry', l: 'Status expiry date (if applicable)', t: 'date' }, { n: 'education', l: 'Education history', t: 'textarea' },
    { n: 'work', l: 'Work experience', t: 'textarea' }, { n: 'question', l: 'Your main immigration question', t: 'textarea', r: 1 },
    { n: 'time', l: 'Preferred consultation time', t: 'text' },
    { n: 'method', l: 'Preferred contact method', t: 'select', o: ['WhatsApp', 'Email', 'Phone call'] }]],
  ['partner', 'Partner with UGEC', [
    { n: 'institution', l: 'Institution name', t: 'text', r: 1 }, { n: 'contact', l: 'Contact person', t: 'text', r: 1 },
    { n: 'email', l: 'Email', t: 'email', r: 1 }, { n: 'phone', l: 'Phone', t: 'tel' }, { n: 'province', l: 'Province', t: 'text', r: 1 },
    { n: 'programs', l: 'Programs offered', t: 'textarea' }, { n: 'website', l: 'Website', t: 'text' },
    { n: 'ptype', l: 'Partnership type', t: 'select', o: ['Recruitment partner', 'Program referral', 'Placement partner', 'Other'] },
    { n: 'message', l: 'Message', t: 'textarea' }]],
];

const team = [
  ['Kedar Dhungana', 'Founder and Director'], ['Mamata Shiwakoti', 'Co-Founder'], ['Ganesh Kharel', 'Editor'],
  ['Vimal Kumar', 'RCIC'], ['Kevin Osei-Sarfo', 'Consultant'], ['Utsab Shiwakoti', 'Technical Analyst'],
];

const posts = [
  ['choose-a-college-program-in-canada', 'How to choose a college program in Canada', 'Education planning', '2026-10-05', 'Five questions to settle before you apply.',
    'Start with the job you want in three years, then work backwards to the credential that leads there.\n\nCompare programs on total cost, delivery format, placement hours and the province, not on tuition alone.\n\nAsk each college for current admission requirements and intake dates in writing. They change, and the college is the final source.\n\nBook a free educational consultation if you want help comparing two or three options side by side.'],
  ['what-to-ask-a-college-before-paying', 'What to ask a college before you pay a deposit', 'Study in Canada guides', '2026-09-22', 'A short checklist for any program.',
    'Is the program approved by the relevant regulator or body for its field?\n\nWho arranges the placement, and how many hours are included?\n\nWhat are the full fees, including books, equipment and exams, and how do instalments work?\n\nWhat are the refund terms if your plans change?'],
  ['why-intake-dates-matter', 'Why intake dates matter for your plan', 'Program intake updates', '2026-09-10', 'Planning backwards from your start date.',
    'Intakes fill early. Some programs run morning and evening batches, which gives more flexibility.\n\nAllow time to collect documents, translate records if needed and complete the college application.\n\nMessage UGEC for the latest intake dates before you commit to a timeline.'],
];

function seedAdmin() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c) return;
  const email = process.env.ADMIN_EMAIL;
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw || pw === 'change-this-password-now') {
    console.warn('[seed] No admin created. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, then restart.');
    return;
  }
  db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(email.toLowerCase(), hashPassword(pw));
  console.log(`[seed] Admin created: ${email}`);
}

function seedContent() {
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(settings)) db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, v);
    if (!db.prepare('SELECT COUNT(*) c FROM programs').get().c) {
      const ins = db.prepare(`INSERT INTO programs(slug,name,category,province,duration,delivery,fees,admission,placement,credential,pathways,guarantee,notes,coming_soon,sort)
        VALUES(@slug,@name,@category,@province,@duration,@delivery,@fees,@admission,@placement,@credential,@pathways,@guarantee,@notes,@coming_soon,@sort)`);
      programs.forEach((p, i) => ins.run({ duration: '', delivery: '', fees: '', admission: '', placement: '', credential: '', pathways: '', guarantee: '', notes: '', coming_soon: 0, sort: i, ...p }));
    }
    if (!db.prepare('SELECT COUNT(*) c FROM forms').get().c) {
      const ins = db.prepare('INSERT INTO forms(type,title,fields) VALUES(?,?,?)');
      forms.forEach(([t, title, f]) => ins.run(t, title, JSON.stringify(f, null, 2)));
    }
    if (!db.prepare('SELECT COUNT(*) c FROM team').get().c) {
      const ins = db.prepare('INSERT INTO team(name,role,sort) VALUES(?,?,?)');
      team.forEach(([n, r], i) => ins.run(n, r, i));
    }
    if (!db.prepare('SELECT COUNT(*) c FROM posts').get().c) {
      const ins = db.prepare('INSERT INTO posts(slug,title,category,published_at,summary,body) VALUES(?,?,?,?,?,?)');
      posts.forEach((p) => ins.run(...p));
    }
  });
  tx();
}

function seedIfEmpty() { seedContent(); seedAdmin(); }

module.exports = { seedIfEmpty };

if (require.main === module) {
  require('dotenv').config();
  if (process.argv.includes('--reset')) {
    for (const t of ['programs', 'forms', 'team', 'posts', 'settings']) db.exec(`DELETE FROM ${t}`);
    console.log('[seed] Cleared content tables (leads and users kept).');
  }
  seedIfEmpty();
  console.log('[seed] Done.');
}
