const GATEWAY = process.env.EMAIL_GATEWAY_URL || (process.env.DB_HOST ? 'http://127.0.0.1:2525/api/email/send' : '');
const mode = () => (process.env.SMTP_HOST ? 'smtp' : GATEWAY ? 'gateway' : 'off');
const enabled = () => mode() !== 'off';

let transporter = null;
function smtp() {
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function send({ to, subject, text, replyTo }) {
  if (mode() === 'smtp') {
    await smtp().sendMail({ from: process.env.MAIL_FROM || 'UGEC Canada <no-reply@ugec.ca>', to, replyTo: replyTo || undefined, subject, text });
    return;
  }
  const body = { to: [].concat(to), subject, text };
  if (replyTo) body.replyTo = replyTo;
  const from = process.env.MAIL_FROM || defaultFrom();
  try {
    await gateway(from ? { ...body, from } : body);
  } catch (e) {
    if (!from || e.unreachable) throw e;
    console.warn(`[mail] the email service refused the sender "${from}" (${e.message}); sending with its default sender instead`);
    await gateway(body);
  }
}
function defaultFrom() {
  let host = '';
  try { host = new URL(process.env.SITE_URL || '').hostname.replace(/^www\./, ''); } catch { return ''; }
  return host.includes('.') && !/localhost|preview|airoapp/.test(host) ? `UGEC Canada <no-reply@${host}>` : '';
}
async function gateway(body) {
  let res, out;
  try {
    res = await fetch(GATEWAY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    out = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  } catch (e) { throw Object.assign(new Error(`email service unreachable: ${e.message}`), { unreachable: true }); }
  if (!res.ok || !out.success) throw new Error(`email not sent: ${out.error || `HTTP ${res.status}`}`); // logged only, never shown to visitors
}

async function notifyLead({ to, title, lines, replyTo }) {
  if (!enabled() || !to) return;
  await send({ to, replyTo, subject: `New website lead: ${title}`, text: lines.join('\n') });
}

async function confirmLead({ to, name, title, settings }) {
  if (!enabled() || !to) return;
  const first = String(name || '').trim().split(/\s+/)[0];
  const text = [
    `Hi${first ? ' ' + first : ''},`, '',
    `Thank you for contacting UGEC Canada. We have received your request (${title}) and a member of our team will be in touch soon.`, '',
    'If you have more to add, simply reply to this email.',
    settings.phone_display ? `For a faster answer, message us on WhatsApp: ${settings.phone_display}` : '', '',
    'UGEC Canada', settings.location || '', settings.contact_email || '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  await send({ to, replyTo: settings.contact_email, subject: 'We received your request | UGEC Canada', text });
}

async function sendPartnerLink({ to, name, link, kind }) {
  if (!enabled() || !to) return;
  const invite = kind === 'invite';
  const text = [
    `Hi ${name},`, '',
    invite
      ? 'UGEC Canada has set up your referral partner portal, where you can see the people you have referred, how they are progressing and your commission. Choose your password here to sign in (this link works for 7 days):'
      : 'Someone asked to reset the password for your UGEC Canada referral partner portal. Choose a new password here (this link works for 1 hour):',
    '', link, '',
    invite ? 'After that, sign in any time at the same website under "Referral partner portal".' : 'If you did not ask for this, you can ignore this email; your password has not changed.',
    '', 'UGEC Canada',
  ].join('\n');
  await send({ to, subject: invite ? 'Your UGEC Canada referral partner portal' : 'Reset your UGEC Canada portal password', text });
}

async function sendTest(to) {
  if (!enabled()) throw new Error('Email is not set up yet. On GoDaddy it works automatically; on your own computer add SMTP_HOST, SMTP_USER and SMTP_PASS to .env and restart the site.');
  try { await send({ to, subject: 'UGEC Canada website: test email', text: 'Email from the UGEC Canada website is working. New leads will be sent like this.' }); }
  catch (e) { console.error('[mail]', e.message); throw new Error('The test email could not be sent. Check the email settings (the server log has the details).'); }
}

module.exports = { notifyLead, confirmLead, sendPartnerLink, sendTest, enabled, mode };
