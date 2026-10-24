const path = require('path');
const { pathToFileURL } = require('url');
const content = require('./content');
const { readTemplates } = require('./templates');
const { partnerForCode } = require('./routes/portal');

const PROD = process.env.NODE_ENV === 'production';
const JS = path.join(__dirname, '..', 'public', 'js');

let mods = null;
const load = () => (mods ||= Promise.all(['core/tpl.js', 'core/site.js', 'core/pages.js', 'components/shell.js']
  .map((f) => import(pathToFileURL(path.join(JS, f)).href)))
  .then(([tpl, site, pages, shell]) => ({ tpl, site, pages, shell })));

let templatesLoaded = false;

async function render(urlPath, search, origin = '', partnerId = null) {
  const m = await load();
  const p = m.pages.cleanPath(urlPath);
  const need = m.pages.needs(p);
  const [site, programs, posts] = await Promise.all([content.site(), content.programs(), need === 'posts' ? content.posts() : null]);
  let loaded = null;
  if (need && need.post) loaded = await content.postBySlug(need.post);
  else if (need && need.portal) loaded = await content.portal(partnerId);
  else if (need && need.setPassword) { const r = await partnerForCode(need.setPassword); loaded = r ? content.resetInfo(r) : null; }
  if (!PROD || !templatesLoaded) { m.tpl.setTemplates(readTemplates()); templatesLoaded = true; } // dev: pick up edits
  m.site.initSite(site, programs, posts, origin);
  return { page: m.pages.pageFor(p, new URLSearchParams(search), loaded), shell: m.shell.shellParts(p) };
}

module.exports = { render };
