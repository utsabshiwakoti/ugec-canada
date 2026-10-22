const path = require('path');
const { pathToFileURL } = require('url');
const content = require('./content');
const { readTemplates } = require('./templates');

const PROD = process.env.NODE_ENV === 'production';
const JS = path.join(__dirname, '..', 'public', 'js');

let mods = null;
const load = () => (mods ||= Promise.all(['core/tpl.js', 'core/site.js', 'core/pages.js', 'components/shell.js']
  .map((f) => import(pathToFileURL(path.join(JS, f)).href)))
  .then(([tpl, site, pages, shell]) => ({ tpl, site, pages, shell })));

let templatesLoaded = false;

async function render(urlPath, search, origin = '') {
  const m = await load();
  if (!PROD || !templatesLoaded) { m.tpl.setTemplates(readTemplates()); templatesLoaded = true; } // dev: pick up edits
  const p = m.pages.cleanPath(urlPath);
  const need = m.pages.needs(p);
  m.site.initSite(content.site(), content.programs(), need === 'posts' ? content.posts() : null, origin);
  const loaded = need && need.post ? content.postBySlug(need.post) : need && need.portal ? content.portal(need.portal) : null;
  return { page: m.pages.pageFor(p, new URLSearchParams(search), loaded), shell: m.shell.shellParts(p) };
}

module.exports = { render };
