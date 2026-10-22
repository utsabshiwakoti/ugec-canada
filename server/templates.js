const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'templates');

function readTemplates(dir = DIR, prefix = '') {
  const out = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) Object.assign(out, readTemplates(path.join(dir, e.name), `${prefix}${e.name}/`));
    else if (e.name.endsWith('.html')) out[prefix + e.name.slice(0, -5)] = fs.readFileSync(path.join(dir, e.name), 'utf8');
  }
  return out;
}

module.exports = { readTemplates };
