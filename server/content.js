const db = require('./db');

const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

function site() {
  const s = db.getSettings();
  const forms = {};
  for (const f of db.prepare('SELECT type,title,fields FROM forms WHERE enabled=1').all()) forms[f.type] = { title: f.title, fields: parse(f.fields, []) };
  return {
    settings: {
      tagline: s.tagline, location: s.location, email: s.contact_email, phoneDisplay: s.phone_display, phoneRaw: s.phone_raw,
      stripeUrl: s.stripe_url, rcic: { name: s.rcic_name, title: s.rcic_title, licence: s.rcic_licence },
      announcement: s.announcement_active === '1' ? s.announcement : '',
      categoryInfo: parse(s.category_info, {}),
      heroImage: s.hero_image || '', aboutImage: s.about_image || '', logo: s.logo || '', logoDark: s.logo_dark || '',
      logoHeight: Math.min(96, Math.max(28, Number(s.logo_height) || 44)),
      faq: parse(s.faq, []), testimonials: parse(s.testimonials, []),
    },
    forms,
    referrers: db.prepare('SELECT code, name FROM referral_partners WHERE active=1 AND listed=1 ORDER BY name').all(),
    team: db.prepare('SELECT name,role,photo FROM team WHERE visible=1 ORDER BY sort,id').all(),
  };
}

const programSql = `SELECT p.slug,p.name,p.category,p.province,p.campus,pr.name AS provider,p.duration,p.delivery,p.intake,p.fees,p.admission,
  p.english,p.placement,p.credential,p.career,p.suitable,p.pathways,p.guarantee,p.notes,p.coming_soon
  FROM programs p LEFT JOIN providers pr ON pr.id=p.provider_id WHERE p.published=1`;
const program = (r) => r && { ...r, coming_soon: !!r.coming_soon };

const programs = () => db.prepare(programSql + ' ORDER BY p.sort,p.name').all().map(program);
const programBySlug = (slug) => program(db.prepare(programSql + ' AND p.slug=?').get(slug));
const posts = () => db.prepare("SELECT slug,title,category,summary,published_at FROM posts WHERE published=1 AND published_at<=date('now') ORDER BY published_at DESC").all();
const postBySlug = (slug) => db.prepare("SELECT slug,title,category,summary,body,published_at FROM posts WHERE slug=? AND published=1 AND published_at<=date('now')").get(slug) || null;

const shortName = (n) => {
  const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Name not given';
  return parts[0] + (parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '');
};
function portal(token) {
  if (!token || String(token).length < 20) return null;
  const p = db.prepare("SELECT id, name, code, active FROM referral_partners WHERE portal_token=? AND portal_token != ''").get(String(token));
  if (!p) return null;
  const rows = db.prepare(`SELECT l.created_at, l.name, l.program, l.status, l.commission_status, l.commission_amount, f.title AS form_title
    FROM leads l LEFT JOIN forms f ON f.type = l.form_type WHERE l.referral_partner_id=? ORDER BY l.created_at DESC, l.id DESC`).all(p.id);
  return {
    partner: { name: p.name, code: p.code, active: !!p.active },
    referrals: rows.map((r) => ({
      date: r.created_at.slice(0, 10), client: shortName(r.name), asked: r.program || r.form_title || '',
      status: r.status, commission: r.commission_status, amount: Number(r.commission_amount) || 0,
    })),
  };
}

module.exports = { site, programs, programBySlug, posts, postBySlug, portal };
