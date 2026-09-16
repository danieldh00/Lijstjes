const { verify } = require('./auth/session');

const COOKIE_NAME = 'lijstjes_session';

// Vast IP van de Supervisor binnen het interne hassio-Docker-netwerk
// (172.30.32.0/23) -- gedocumenteerd en stabiel, zie
// https://developers.home-assistant.io/docs/add-ons/communication/.
// De ingress-proxy van Supervisor verbindt altijd rechtstreeks vanaf dit
// adres met de add-on-container, op dezelfde poort als de directe
// poort-3100-toegang. Dat maakt dit -- en niet de door de client zelf mee te
// sturen 'X-Ingress-Path'-header -- de enige betrouwbare manier om
// ingress-verkeer te onderscheiden van rechtstreeks verkeer naar poort 3100.
// (Zonder deze check kon elk toestel dat poort 3100 kan bereiken zich met
// die header simpelweg als ingress-verkeer voordoen en zo de pairing
// volledig overslaan.)
const SUPERVISOR_IPS = new Set(['172.30.32.2']);

function remoteIp(req) {
  const raw = req.socket?.remoteAddress || '';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

// Twee manieren om deze app te mogen gebruiken zonder een eigen
// account-systeem:
//  1. Via Home Assistant Ingress -- alleen een al bij HA ingelogde gebruiker
//     kan hier komen, dus dat vertrouwen we direct. Vertrouwen hangt af van
//     de werkelijke TCP-bronadres (niet-vervalsbaar), nooit van een
//     door de client zelf meegestuurde header.
//  2. Via de directe poort (voor de installeerbare, offline-vriendelijke
//     PWA) -- daar moet dit toestel eenmaal gekoppeld zijn met een geldig
//     Home Assistant Long-Lived Access Token (zie routes/auth.js), waarna
//     een ondertekend cookie het toestel onthoudt.
function requireAccess(req, res, next) {
  if (req.headers['x-ingress-path'] && SUPERVISOR_IPS.has(remoteIp(req))) {
    req.viaIngress = true;
    return next();
  }

  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken && verify(cookieToken)) {
    req.deviceId = cookieToken;
    return next();
  }

  res.status(401).json({ error: 'not_paired', message: 'Dit toestel is nog niet gekoppeld aan Home Assistant.' });
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
}

module.exports = { requireAccess, setSessionCookie, COOKIE_NAME, remoteIp };
