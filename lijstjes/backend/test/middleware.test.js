const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lijstjes-middleware-'));

const { requireAccess, remoteIp } = require('../src/middleware');
const { createSessionToken } = require('../src/auth/session');

function mockReq({ ip, headers = {}, cookies = {} } = {}) {
  return { socket: { remoteAddress: ip }, headers, cookies };
}

function mockRes() {
  let statusCode = null;
  let body = null;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
    },
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

test('remoteIp haalt het IPv4-mapped IPv6-voorvoegsel weg', () => {
  assert.equal(remoteIp({ socket: { remoteAddress: '::ffff:172.30.32.2' } }), '172.30.32.2');
  assert.equal(remoteIp({ socket: { remoteAddress: '172.30.32.2' } }), '172.30.32.2');
  assert.equal(remoteIp({ socket: {} }), '');
});

test('vertrouwt de X-Ingress-Path-header alleen vanaf het Supervisor-IP', () => {
  const req = mockReq({ ip: '172.30.32.2', headers: { 'x-ingress-path': '/' } });
  const res = mockRes();
  let called = false;
  requireAccess(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(req.viaIngress, true);
});

test('wijst een vervalste ingress-header vanaf elk ander adres af', () => {
  // Dit is precies het scenario van de eerder gevonden kwetsbaarheid: een
  // client die rechtstreeks (niet via Supervisor) verbindt en zelf de
  // 'X-Ingress-Path'-header meestuurt om zich als ingress-verkeer voor te
  // doen.
  const req = mockReq({ ip: '203.0.113.5', headers: { 'x-ingress-path': '/' } });
  const res = mockRes();
  let called = false;
  requireAccess(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.getStatus(), 401);
});

test('accepteert een geldig, niet-ingetrokken sessiecookie ongeacht het bronadres', () => {
  const token = createSessionToken();
  const req = mockReq({ ip: '203.0.113.5', cookies: { lijstjes_session: token } });
  const res = mockRes();
  let called = false;
  requireAccess(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(req.deviceId, token);
});

test('wijst een ontbrekend of ongeldig cookie af', () => {
  const req = mockReq({ ip: '203.0.113.5', cookies: {} });
  const res = mockRes();
  let called = false;
  requireAccess(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.getStatus(), 401);
});
