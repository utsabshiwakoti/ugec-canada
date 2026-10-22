let transporter = null;
function get() {
  if (transporter !== null) return transporter;
  if (!process.env.SMTP_HOST) return (transporter = false);
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}
const from = () => process.env.MAIL_FROM || 'UGEC Canada <no-reply@ugec.ca>';
const enabled = () => !!process.env.SMTP_HOST;

async function notifyLead({ to, title, lines, replyTo }) {
  const t = get();
  if (!t || !to) return;
  await t.sendMail({ from: from(), to, replyTo: replyTo || undefined, subject: `New website lead: ${title}`, text: lines.join('\n') });
}

async function confirmLead({ to, name, title, settings }) {
  const t = get();
  if (!t || !to) return;
  const first = String(name || '').trim().split(/\s+/)[0];
  const text = [
    `Hi${first ? ' ' + first : ''},`, '',
    `Thank you for contacting UGEC Canada. We have received your request (${title}) and a member of our team will be in touch soon.`, '',
    'If you have more to add, simply reply to this email.',
    settings.phone_display ? `For a faster answer, message us on WhatsApp: ${settings.phone_display}` : '', '',
    'UGEC Canada', settings.location || '', settings.contact_email || '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  await t.sendMail({ from: from(), to, replyTo: settings.contact_email || undefined, subject: 'We received your request | UGEC Canada', text });
}

async function sendPortalLink({ to, name, link }) {
  const t = get();
  if (!t || !to) return;
  const text = [
    `Hi ${name},`, '',
    'Here is your private link to see the people you have referred to UGEC Canada and how they are progressing:', '', link, '',
    'Keep this link to yourself: anyone who has it can see your referrals. If you did not ask for it, you can ignore this email.', '',
    'UGEC Canada',
  ].join('\n');
  await t.sendMail({ from: from(), to, subject: 'Your UGEC Canada referral portal link', text });
}

async function sendTest(to) {
  const t = get();
  if (!t) throw new Error('Email is not set up yet. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env and restart the site.');
  await t.sendMail({ from: from(), to, subject: 'UGEC Canada website: test email', text: 'Email from the UGEC Canada website is working. New leads will be sent like this.' });
}

module.exports = { notifyLead, confirmLead, sendPortalLink, sendTest, enabled };
