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
      // http://supervisor/core is Supervisor's OWN proxy, authenticated with
      // this add-on's SUPERVISOR_TOKEN -- it does not relay an arbitrary
      // user-supplied bearer token through to Core, so validating the
      // pasted token there always fails regardless of whether it's valid.
      // homeassistant_api: true (config.yaml) grants direct network access
      // to the real Core container instead, where a normal Long-Lived
      // Access Token does get validated properly.
      validateBaseUrl = 'http://homeassistant:8123';
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

    const result = await validateToken(validateBaseUrl, token);
    if (!result.ok) {
      if (result.reason === 'unreachable') {
        return res.status(502).json({
          error: 'ha_unreachable',
          message: `Kon Home Assistant niet bereiken op ${validateBaseUrl} (${result.detail}).`,
        });
      }
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
