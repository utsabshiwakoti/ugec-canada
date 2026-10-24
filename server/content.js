const db = require('./db');

const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

async function site() {
  const s = await db.getSettings();
  const forms = {};
  for (const f of await db.all('SELECT type, title, fields FROM forms WHERE enabled=1')) forms[f.type] = { title: f.title, fields: parse(f.fields, []) };
  return {
    settings: {
      tagline: s.tagline, location: s.location, email: s.contact_email, phoneDisplay: s.phone_display, phoneRaw: s.phone_raw,
      stripeUrl: s.stripe_url, rcic: { name: s.rcic_name, title: s.rcic_title, licence: s.rcic_licence },
      announcement: s.announcement_active === '1' ? s.announcement : '',
      categoryInfo: parse(s.category_info, {}),
      heroImage: s.hero_image || '', aboutImage: s.about_image || '', logo: s.logo || '', logoDark: s.logo_dark || '',
      logoHeight: Math.min(96, Math.max(28, Number(s.logo_height) || 44)),
      faq: parse(s.faq, []), testimonials: parse(s.testimonials, []),
      social: [['Facebook', s.facebook_url], ['Instagram', s.instagram_url], ['TikTok', s.tiktok_url]].filter(([, href]) => href).map(([label, href]) => ({ label, href })),
    },
    forms,
    referrers: await db.all('SELECT code, name FROM referral_partners WHERE active=1 AND listed=1 ORDER BY name'),
    team: await db.all('SELECT name, role, photo FROM team WHERE visible=1 ORDER BY sort, id'),
  };
}

const programSql = `SELECT p.slug, p.name, p.category, p.province, p.campus, pr.name AS provider, p.duration, p.delivery, p.intake, p.fees,
  p.admission, p.english, p.placement, p.credential, p.career, p.suitable, p.pathways, p.guarantee, p.notes, p.coming_soon
  FROM programs p LEFT JOIN providers pr ON pr.id=p.provider_id WHERE p.published=1`;
const program = (r) => r && { ...r, coming_soon: !!r.coming_soon };

const programs = async () => (await db.all(programSql + ' ORDER BY p.sort, p.name')).map(program);
const programBySlug = async (slug) => program(await db.get(programSql + ' AND p.slug=?', slug));
const posts = () => db.all('SELECT slug, title, category, summary, published_at FROM posts WHERE published=1 AND published_at<=? ORDER BY published_at DESC', db.today());
const postBySlug = async (slug) => (await db.get('SELECT slug, title, category, summary, body, published_at FROM posts WHERE slug=? AND published=1 AND published_at<=?', slug, db.today())) || null;

const shortName = (n) => {
  const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Name not given';
  return parts[0] + (parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '');
};
async function portal(partnerId) {
  const p = partnerId ? await db.get('SELECT id, name, email, code, active FROM referral_partners WHERE id=?', partnerId) : null;
  if (!p) return null;
  const rows = await db.all(`SELECT l.created_at, l.name, l.program, l.status, l.commission_status, l.commission_amount, f.title AS form_title
    FROM leads l LEFT JOIN forms f ON f.type = l.form_type WHERE l.referral_partner_id=? ORDER BY l.created_at DESC, l.id DESC`, p.id);
  return {
    partner: { name: p.name, email: p.email, code: p.code, active: !!p.active },
    referrals: rows.map((r) => ({
      date: String(r.created_at).slice(0, 10), client: shortName(r.name), asked: r.program || r.form_title || '',
      status: r.status, commission: r.commission_status, amount: Number(r.commission_amount) || 0,
    })),
  };
}

const resetInfo = (p) => ({ name: p.name, email: p.email, first: !p.password_hash });

module.exports = { site, programs, programBySlug, posts, postBySlug, portal, resetInfo };
