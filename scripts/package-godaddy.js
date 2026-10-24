const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'ugec-godaddy.zip');
const INCLUDE = [/^server\//, /^public\//, /^scripts\//, /^package\.json$/, /^package-lock\.json$/, /^README\.md$/];
const NEVER = [/^node_modules\//, /^\.env/, /^data\//, /^\.git\//, /^Photos\//i, /^public\/assets\//, /\.zip$/, /^\.vscode\//];

let files;
try {
  files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  console.error('This needs Git (it uses .gitignore to know which files belong to the site). Install it from git-scm.com.');
  process.exit(1);
}
files = files.filter((f) => INCLUDE.some((r) => r.test(f)) && !NEVER.some((r) => r.test(f)) && fs.existsSync(path.join(ROOT, f)));
const skipped = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !INCLUDE.some((r) => r.test(f)));
if (skipped.length) console.log(`Left out ${skipped.length} file(s) that are not part of the site, e.g. ${skipped.slice(0, 2).join(', ')}`);
for (const must of ['package.json', 'package-lock.json', 'server/index.js']) if (!files.includes(must)) { console.error(`Missing ${must}`); process.exit(1); }

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const local = [], central = [];
let offset = 0;
for (const f of files) {
  const data = fs.readFileSync(path.join(ROOT, f)), comp = zlib.deflateRawSync(data, { level: 9 }), name = Buffer.from(f, 'utf8'), crc = crc32(data);
  const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
  head.writeUInt32LE(crc, 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
  local.push(head, name, comp);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
  central.push(cen, name);
  offset += 30 + name.length + comp.length;
}
const cenSize = central.reduce((a, b) => a + b.length, 0);
const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(OUT, Buffer.concat([...local, ...central, end]));

const mb = (fs.statSync(OUT).size / 1048576).toFixed(2);
console.log(`Made ugec-godaddy.zip: ${files.length} files, ${mb} MB (GoDaddy allows up to 100 MB).`);
console.log('Upload it in GoDaddy > Node.js Hosting.');
