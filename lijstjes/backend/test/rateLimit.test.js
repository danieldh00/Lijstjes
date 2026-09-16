const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../src/rateLimit');

function mockReqRes(extra = {}) {
  let statusCode = null;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
    },
  };
  return { req: { ...extra }, res, getStatus: () => statusCode, getBody: () => body };
}

test('laat verzoeken onder de limiet door', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3, keyFn: () => 'k' });
  for (let i = 0; i < 3; i++) {
    const { req, res, getStatus } = mockReqRes();
    let called = false;
    limiter(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(getStatus(), null);
  }
});

test('blokkeert zodra de limiet overschreden wordt (429)', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, keyFn: () => 'same-key' });
  const outcomes = [];
  for (let i = 0; i < 3; i++) {
    const { req, res, getStatus } = mockReqRes();
    let called = false;
    limiter(req, res, () => {
      called = true;
    });
    outcomes.push({ called, status: getStatus() });
  }
  assert.deepEqual(
    outcomes.map((o) => o.called),
    [true, true, false]
  );
  assert.equal(outcomes[2].status, 429);
});

test('houdt verschillende keys onafhankelijk van elkaar bij', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, keyFn: (req) => req.ip });
  const a = mockReqRes({ ip: 'a' });
  const b = mockReqRes({ ip: 'b' });
  let calledA = false;
  let calledB = false;
  limiter(a.req, a.res, () => {
    calledA = true;
  });
  limiter(b.req, b.res, () => {
    calledB = true;
  });
  assert.equal(calledA, true);
  assert.equal(calledB, true);
});

test('reset na het verstrijken van het tijdvenster', async () => {
  const limiter = createRateLimiter({ windowMs: 50, max: 1, keyFn: () => 'k' });

  const first = mockReqRes();
  let calledFirst = false;
  limiter(first.req, first.res, () => {
    calledFirst = true;
  });
  assert.equal(calledFirst, true);

  const second = mockReqRes();
  let calledSecond = false;
  limiter(second.req, second.res, () => {
    calledSecond = true;
  });
  assert.equal(calledSecond, false);

  await new Promise((resolve) => setTimeout(resolve, 70));

  const third = mockReqRes();
  let calledThird = false;
  limiter(third.req, third.res, () => {
    calledThird = true;
  });
  assert.equal(calledThird, true);
});
