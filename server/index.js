require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { seedIfEmpty } = require('./seed');
const { metaFor, sitemap, siteIcon } = require('./seo');
const { readTemplates } = require('./templates');
const { render } = require('./render');
const backup = require('./backup');

seedIfEmpty();
backup.schedule();

const app = express();
const PUBLIC = path.join(__dirname, '..', 'public');
const PROD = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: PROD ? [] : null,
    },
  },
}));
app.use(express.json({ limit: '100kb' }));

app.use('/api', require('./routes/public'));
app.use('/admin/api', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.get('/robots.txt', (req, res) => {
  const b = (process.env.SITE_URL || '').replace(/\/$/, '');
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /referral-portal/\n${b ? `Sitemap: ${b}/sitemap.xml\n` : ''}`);
});
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(sitemap()));
app.get('/favicon.ico', (req, res) => res.redirect(302, siteIcon()));

const REDIRECTS = { '/study-in-canada': '/already-in-canada', '/educational-consultation': '/book-consultation?type=educational', '/immigration-consultation': '/book-consultation?type=immigration' };
app.get(Object.keys(REDIRECTS), (req, res) => {
  const target = REDIRECTS[req.path];
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  res.redirect(301, qs ? target + (target.includes('?') ? '&' : '?') + qs : target);
});

let templatesJson = null;
app.get('/templates.json', (req, res) => {
  const body = PROD ? (templatesJson ||= JSON.stringify(readTemplates())) : JSON.stringify(readTemplates());
  res.set('Cache-Control', PROD ? 'public, max-age=300' : 'no-cache').type('application/json').send(body);
});

app.use(express.static(PUBLIC, { index: false, maxAge: PROD ? '1h' : 0 }));
app.use('/uploads', express.static(require('./uploads').DIR, { index: false, maxAge: PROD ? '30d' : 0, immutable: PROD }));
app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(PUBLIC, 'admin', 'index.html')));

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const template = () => fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
let cached = null;
app.get('*', async (req, res) => {
  if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).send('Not found');
  const origin = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const { known, private: isPrivate, html: seo } = metaFor(req.path, origin);
  if (isPrivate || req.path.startsWith('/referral-portal/')) res.set('Cache-Control', 'no-store'); // partner portal pages
  const parts = { SEO: seo, SSR: '', APP: '<div class="wrap sec"><p>Loading...</p></div>', BANNER: '', BRAND: '', NAV: '', HBOOK: '', ABAR: '', FOOT: '', WAF: '#' };
  try {
    const search = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    const { page, shell } = await render(req.path, search, origin);
    Object.assign(parts, { SSR: ` data-ssr="${attr(req.originalUrl)}"`, APP: page.html, BANNER: shell.banner, BRAND: shell.brand, NAV: shell.nav, HBOOK: shell.hbook, ABAR: shell.abar, FOOT: shell.foot, WAF: attr(shell.waf) });
  } catch (e) {
    console.error('[render]', e); // the browser will still build the page itself
  }
  const tpl = PROD ? (cached ||= template()) : template();
  const out = tpl.replace(/<!--(SEO|SSR|APP|BANNER|BRAND|NAV|HBOOK|ABAR|FOOT|WAF)-->/g, (m, k) => parts[k]);
  res.status(known ? 200 : 404).type('html').send(out);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Bad request' : 'Server error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`UGEC Canada running at http://localhost:${port}  (admin: /admin)`));
