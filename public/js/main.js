import { S } from './core/state.js';
import { $, api } from './core/util.js';
import { loadTemplates } from './core/tpl.js';
import { initSite } from './core/site.js';
import { captureRef } from './core/referral.js';
import { render } from './router.js';
import './events.js';

async function start() {
  try {
    const [site, programs] = await Promise.all([api('/api/site'), api('/api/programs'), loadTemplates()]);
    initSite(site, programs, null, location.origin);
    await captureRef();
    const ssr = $('#app').dataset.ssr === location.pathname + location.search;
    await render(false, ssr && !S.ref);
  } catch (e) {
    console.error(e);
    if (!$('#app').dataset.ssr) $('#app').innerHTML = '<div class="wrap sec"><h1>We are having trouble loading</h1><p>Please refresh, or contact UGEC at kedar.dhungana@ugec.ca or +1 782 234 0211.</p></div>';
  }
}
start();
