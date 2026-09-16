const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Moet vóór het vereisen van config/session gezet worden: DATA_DIR wordt op
// module-niveau ingelezen (zie src/config.js).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lijstjes-session-'));

const { createSessionToken, verify, revoke } = require('../src/auth/session');

test('een vers aangemaakt sessietoken is geldig', () => {
  const token = createSessionToken();
  assert.equal(verify(token), true);
});

test('een geknoeid token wordt afgewezen', () => {
  const token = createSessionToken();
  assert.equal(verify(`${token}x`), false);
});

test('ongeldige invoer wordt afgewezen zonder te crashen', () => {
  assert.equal(verify(''), false);
  assert.equal(verify(null), false);
  assert.equal(verify(undefined), false);
  assert.equal(verify('geen-punt-hier'), false);
});

test('revoke maakt een eerder geldig token ongeldig, andere tokens blijven werken', () => {
  const tokenA = createSessionToken();
  const tokenB = createSessionToken();
  revoke(tokenA);
  assert.equal(verify(tokenA), false);
  assert.equal(verify(tokenB), true);
});
