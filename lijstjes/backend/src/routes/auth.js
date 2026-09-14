const express = require('express');
const { validateToken } = require('../ha/client');
const { getOperatingCredential, storeOperatingCredential, isSupervised } = require('../config');
const { createSessionToken, verify } = require('../auth/session');
const { setSessionCookie, COOKIE_NAME } = require('../middleware');

const router = express.Router();

router.get('/status', (req, res) => {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  res.json({
    viaIngress: !!req.viaIngress,
    paired: !!(req.viaIngress || (cookieToken && verify(cookieToken))),
    needsHaUrl: !isSupervised() && !getOperatingCredential(),
  });
});

router.post('/pair', async (req, res, next) => {
  try {
    const { ha_url: haUrl, token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'token_required', message: 'Vul een Long-Lived Access Token in.' });
    }

    let validateBaseUrl;
    if (isSupervised()) {
      validateBaseUrl = 'http://supervisor/core';
    } else {
      const existing = getOperatingCredential();
      validateBaseUrl = haUrl || (existing ? existing.baseUrl.replace(/\/api$/, '') : null);
      if (!validateBaseUrl) {
        return res.status(400).json({
          error: 'ha_url_required',
          message: 'Vul het adres van je Home Assistant-instantie in (bv. http://homeassistant.local:8123).',
        });
      }
    }

    const ok = await validateToken(validateBaseUrl, token);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_token', message: 'Dit token werkt niet bij dat Home Assistant-adres.' });
    }

    if (!isSupervised() && !getOperatingCredential()) {
      storeOperatingCredential(validateBaseUrl, token);
    }

    setSessionCookie(res, createSessionToken());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
