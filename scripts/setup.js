const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const envPath = path.join(__dirname, '..', '.env');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = [];
let waiting = null;
rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else lines.push(l); });
rl.on('close', () => { if (waiting) waiting(''); });
const ask = (q, def = '') => new Promise((res) => {
  process.stdout.write(def ? `${q} [${def}]: ` : `${q}: `);
  const done = (l) => res(l.trim() || def);
  if (lines.length) done(lines.shift()); else waiting = done;
});

(async () => {
  console.log('\nUGEC Canada setup\n-----------------');
  if (fs.existsSync(envPath)) {
    const a = (await ask('A .env file already exists. Replace it? (yes/no)', 'no')).toLowerCase();
    if (a !== 'yes' && a !== 'y') { console.log('Nothing changed.'); rl.close(); return; }
  }
  const email = await ask('Admin email (you will sign in with this)', 'kedar.dhungana@ugec.ca');
  let password = await ask('Admin password (12+ characters). Press Enter to generate a strong one');
  if (!password) password = crypto.randomBytes(12).toString('base64url');
  while (password.length < 12) password = await ask('That is too short. Enter 12+ characters, or press Enter to generate one', crypto.randomBytes(12).toString('base64url'));
  const site = await ask('Website address (use http://localhost:3000 while testing)', 'http://localhost:3000');
  const port = await ask('Port', '3000');
  const production = site.startsWith('https://');
  const env = [
    `PORT=${port}`,
    `NODE_ENV=${production ? 'production' : 'development'}`,
    `SITE_URL=${site.replace(/\/$/, '')}`,
    `SESSION_SECRET=${crypto.randomBytes(48).toString('hex')}`,
    `ADMIN_EMAIL=${email}`,
    `ADMIN_PASSWORD=${password}`,
    '',
    '# Optional: email me every new lead (fill in your email provider details, then remove the # signs)',
    '# SMTP_HOST=',
    '# SMTP_PORT=587',
    '# SMTP_USER=',
    '# SMTP_PASS=',
    '# MAIL_FROM="UGEC Canada <no-reply@ugec.ca>"',
    '# NOTIFY_EMAIL=kedar.dhungana@ugec.ca',
    '',
  ].join('\n');
  fs.writeFileSync(envPath, env, { mode: 0o600 });
  console.log('\nDone. Your .env file was created.\n');
  console.log(`  Admin email:    ${email}`);
  console.log(`  Admin password: ${password}`);
  console.log('\nSave that password somewhere safe now. It is only shown here.');
  console.log('Next: run  npm start  then open ' + site.replace(/\/$/, '') + '/admin\n');
  rl.close();
})();
