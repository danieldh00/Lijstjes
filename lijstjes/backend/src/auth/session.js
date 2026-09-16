const crypto = require('crypto');
const { getSessionSecret } = require('../config');
const { isRevoked, revoke } = require('./revocations');

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
  // Buffer.from(str, 'hex') kapt ongeldige hexkarakters stilzwijgend af in
  // plaats van te falen -- zonder deze check zou bv. 'geldige-sig' + 'x' nog
  // altijd naar dezelfde bytes parsen als 'geldige-sig' en dus ten onrechte
  // als geldig doorkomen (en daarmee ook de revocatielijst hieronder
  // omzeilen, want die matcht op de exacte, ongewijzigde cookie-string).
  if (sig.length !== expected.length || !/^[0-9a-f]+$/i.test(sig)) return false;
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (!crypto.timingSafeEqual(a, b)) return false;
  // Een geldige handtekening bewijst dat dit toestel ooit gekoppeld is,
  // maar een expliciete "ontkoppel dit toestel"-actie (routes/auth.js:
  // POST /api/auth/unpair) moet die toegang alsnog meteen kunnen intrekken --
  // dus checken tegen de revocatielijst, niet alleen de HMAC.
  return !isRevoked(signed);
}

function createSessionToken() {
  return sign(crypto.randomBytes(24).toString('hex'));
}

module.exports = { createSessionToken, verify, revoke };
