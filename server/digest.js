const db = require('./db');
const mailer = require('./mailer');

const TZ = process.env.BUSINESS_TZ || 'America/Halifax';
const OPEN = "status NOT IN ('enrolled','closed')";

function local(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const today = () => local().date;

async function sendDigests(now = new Date()) {
  if (!mailer.enabled()) return;
  const { date, hour } = local(now);
  if (hour < 8) return;
  if ((await db.getSettings()).digest_last === date) return;
  await db.setSetting('digest_last', date); // first, so a slow send is never repeated
  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  const fresh = await db.all(`SELECT id, name, email, form_type, created_at FROM leads WHERE status='new' AND assigned_to IS NULL ORDER BY created_at`);
  for (const u of await db.all('SELECT id, email, name, role FROM users WHERE digest=1')) {
    const due = await db.all(`SELECT id, name, email, form_type, follow_up FROM leads WHERE assigned_to=? AND follow_up != '' AND follow_up <= ? AND ${OPEN} ORDER BY follow_up`, u.id, date);
    if (!due.length && !fresh.length) continue;
    await mailer.sendDigest({ to: u.email, name: u.name, due, fresh, today: date, adminUrl: site ? site + '/admin/' : '' })
      .catch((e) => console.error('[digest]', e.message));
  }
}

function schedule() {
  const go = () => sendDigests().catch((e) => console.error('[digest]', e.message));
  setTimeout(go, 2 * 60 * 1000).unref();
  setInterval(go, 15 * 60 * 1000).unref();
}

module.exports = { schedule, sendDigests, today, local, TZ };
