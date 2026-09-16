// Lichte in-memory rate limiter, in dezelfde stijl als recentActors.js: geen
// externe afhankelijkheid nodig op deze schaal (één huishouden/klein team,
// één proces, geen persistentie nodig over herstarts heen).
function createRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map(); // key -> array van timestamps binnen het venster

  return function rateLimiter(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (hits.get(key) || []).filter((t) => t > windowStart);
    if (timestamps.length >= max) {
      res.status(429).json({
        error: 'too_many_requests',
        message: message || 'Te veel verzoeken, probeer het over een paar minuten opnieuw.',
      });
      return;
    }
    timestamps.push(now);
    hits.set(key, timestamps);

    // Voorkom ongebounded groei van de Map bij veel verschillende keys.
    if (hits.size > 1000) {
      for (const [k, ts] of hits) {
        if (!ts.some((t) => t > windowStart)) hits.delete(k);
      }
    }

    next();
  };
}

module.exports = { createRateLimiter };
