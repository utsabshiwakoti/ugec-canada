import { S } from './state.js';
import { api } from './util.js';

export const REF_KEY = 'ugec_ref';

export function loadRef() { try { const v = JSON.parse(localStorage.getItem(REF_KEY) || 'null'); if (v && v.exp > Date.now()) return { code: v.code, name: v.name }; } catch (_) {} return null; }

export async function captureRef() {
  const c = new URLSearchParams(location.search).get('ref');
  if (c) {
    try { S.ref = await api('/api/referrers/' + encodeURIComponent(c)); try { localStorage.setItem(REF_KEY, JSON.stringify({ ...S.ref, exp: Date.now() + 30 * 864e5 })); } catch (_) {} } catch (_) { S.ref = loadRef(); }
  } else S.ref = loadRef();
}
