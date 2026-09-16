const express = require('express');
const { validateToken } = require('../ha/client');
const { getOperatingCredential, storeOperatingCredential, isSupervised } = require('../config');
const { createSessionToken, verify, revoke } = require('../auth/session');
const { setSessionCookie, COOKIE_NAME, remoteIp } = require('../middleware');
const { createRateLimiter } = require('../rateLimit');

const router = express.Router();

// Voorkomt ongelimiteerd token-giswerk en beperkt hoe vaak deze add-on op
// verzoek van een client een Long-Lived Access Token tegen Home Assistant
// valideert (elke poging is zelf een verzoek richting HA/Supervisor).
const pairLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  keyFn: remoteIp,
  message: 'Te veel koppelpogingen vanaf dit toestel, probeer het over een paar minuten opnieuw.',
});

router.get('/status', (req, res) => {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  res.json({
    viaIngress: !!req.viaIngress,
    paired: !!(req.viaIngress || (cookieToken && verify(cookieToken))),
    needsHaUrl: !isSupervised() && !getOperatingCredential(),
  });
});

router.post('/pair', pairLimiter, async (req, res, next) => {
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

// Trekt de koppeling van dit toestel in: het cookie zelf blijft geldig
// (correcte handtekening), maar verify() wijst 'm voortaan af via de
// revocatielijst -- zo kan een kwijtgeraakt of niet meer vertrouwd toestel
// direct de toegang verliezen, zonder dat de add-on herstart hoeft te
// worden of alle andere gekoppelde toestellen mee te raken.
router.post('/unpair', (req, res) => {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) revoke(cookieToken);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

module.exports = router;
