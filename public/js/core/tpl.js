import { esc } from './util.js';

const cache = {};
export const globals = {};

const TAG = /\{\{!--[\s\S]*?--\}\}|\{\{\{\s*([\w.@]+)\s*\}\}\}|\{\{\s*(#each|#if|#unless|#with|\/each|\/if|\/unless|\/with|else(?=\s*\}\})|>)?\s*([\s\S]*?)\s*\}\}/g;

function parse(src, name) {
  const root = { kids: [] }, stack = [root];
  const add = (n) => { const top = stack[stack.length - 1]; (top.alt || top.kids).push(n); };
  let last = 0, m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(src))) {
    if (m.index > last) add(src.slice(last, m.index));
    last = TAG.lastIndex;
    const [tag, raw, op, arg] = m;
    if (tag.startsWith('{{!--')) continue;
    if (raw) add({ type: 'raw', path: raw });
    else if (!op) add({ type: 'var', path: arg });
    else if (op[0] === '#') { const n = { type: op.slice(1), path: arg, kids: [], alt: null }; add(n); stack.push(n); }
    else if (op === 'else') {
      const top = stack[stack.length - 1];
      if (top === root || top.alt) throw new Error(`Template "${name}": unexpected {{else}}`);
      top.alt = [];
    } else if (op[0] === '/') {
      const top = stack.pop();
      if (top === root || top.type !== op.slice(1)) throw new Error(`Template "${name}": {{${op}}} does not match ${top === root ? 'any opening tag' : `{{#${top.type} ${top.path}}}`}`);
    } else {
      const [file, ...rest] = arg.split(/\s+/);
      const args = [...rest.join(' ').matchAll(/(\w+)=(?:"([^"]*)"|([\w.@]+))/g)].map(([, k, text, path]) => ({ k, text, path }));
      add({ type: 'partial', file, args });
    }
  }
  if (last < src.length) add(src.slice(last));
  if (stack.length > 1) { const top = stack[stack.length - 1]; throw new Error(`Template "${name}": {{#${top.type} ${top.path}}} is never closed`); }
  return root.kids;
}

function lookup(path, scopes) {
  if (path === 'this') return scopes[scopes.length - 1];
  const [first, ...rest] = path.split('.');
  let v, found = false;
  for (let i = scopes.length - 1; i >= 0 && !found; i--) {
    const s = scopes[i];
    if (s !== null && typeof s === 'object' && first in s) { v = s[first]; found = true; }
  }
  if (!found) v = globals[first];
  for (const k of rest) v = v == null ? undefined : v[k];
  return v;
}

const truthy = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

function run(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    if (typeof n === 'string') { out += n; continue; }
    switch (n.type) {
      case 'var': out += esc(lookup(n.path, scopes)); break;
      case 'raw': out += lookup(n.path, scopes) ?? ''; break;
      case 'if': out += truthy(lookup(n.path, scopes)) ? run(n.kids, scopes) : run(n.alt || [], scopes); break;
      case 'unless': out += truthy(lookup(n.path, scopes)) ? run(n.alt || [], scopes) : run(n.kids, scopes); break;
      case 'with': { const v = lookup(n.path, scopes); out += v ? run(n.kids, [...scopes, v]) : run(n.alt || [], scopes); break; }
      case 'each': {
        const list = lookup(n.path, scopes) || [];
        if (!list.length) { out += run(n.alt || [], scopes); break; }
        list.forEach((item, i) => { out += run(n.kids, [...scopes, { '@index': i, '@number': i + 1, '@first': i === 0, '@last': i === list.length - 1 }, item]); });
        break;
      }
      case 'partial': {
        const frame = {};
        for (const a of n.args) frame[a.k] = a.path !== undefined ? lookup(a.path, scopes) : a.text;
        out += render(n.file, [...scopes, frame]);
        break;
      }
    }
  }
  return out;
}

function render(name, scopes) {
  if (!cache[name]) throw new Error(`Template not found: "${name}" (expected public/templates/${name}.html)`);
  return run(cache[name], scopes);
}

export const t = (name, data = {}) => render(name, [data]);

export function setTemplates(all) {
  for (const k of Object.keys(cache)) delete cache[k];
  for (const [name, src] of Object.entries(all)) cache[name] = parse(src, name);
}

export async function loadTemplates() {
  const r = await fetch('/templates.json');
  if (!r.ok) throw new Error('Could not load templates');
  setTemplates(await r.json());
}
