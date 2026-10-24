const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

function toBase32(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function fromBase32(s) {
  let bits = 0, val = 0;
  const out = [];
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    val = (val << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const newSecret = () => toBase32(crypto.randomBytes(20));

function codeAt(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', fromBase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

function verify(secret, code, after = 0) {
  const c = String(code || '').replace(/\D/g, '');
  if (!secret || c.length !== 6) return 0;
  const now = Math.floor(Date.now() / 1000 / STEP);
  for (const t of [now, now - 1, now + 1]) {
    if (t <= after) continue;
    const want = codeAt(secret, t);
    if (crypto.timingSafeEqual(Buffer.from(want), Buffer.from(c))) return t;
  }
  return 0;
}

const uri = (secret, email) => `otpauth://totp/${encodeURIComponent('UGEC Canada:' + email)}?secret=${secret}&issuer=${encodeURIComponent('UGEC Canada')}&period=${STEP}&digits=6`;

module.exports = { newSecret, verify, uri, codeAt, STEP };
