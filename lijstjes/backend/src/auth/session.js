const crypto = require('crypto');
const { getSessionSecret } = require('../config');

function sign(value) {
  const h = crypto.createHmac('sha256', getSessionSecret()).update(value).digest('hex');
  return `${value}.${h}`;
}

function verify(signed) {
  if (!signed || typeof signed !== 'string') return false;
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return false;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(value).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createSessionToken() {
  return sign(crypto.randomBytes(24).toString('hex'));
}

module.exports = { createSessionToken, verify };
