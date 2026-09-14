const { verify } = require('./auth/session');

const COOKIE_NAME = 'lijstjes_session';

// Twee manieren om deze app te mogen gebruiken zonder een eigen
// account-systeem:
//  1. Via Home Assistant Ingress -- alleen een al bij HA ingelogde gebruiker
//     kan hier komen, dus dat vertrouwen we direct.
//  2. Via de directe poort (voor de installeerbare, offline-vriendelijke
//     PWA) -- daar moet dit toestel eenmaal gekoppeld zijn met een geldig
//     Home Assistant Long-Lived Access Token (zie routes/auth.js), waarna
//     een ondertekend cookie het toestel onthoudt.
function requireAccess(req, res, next) {
  if (req.headers['x-ingress-path']) {
    req.viaIngress = true;
    return next();
  }

  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken && verify(cookieToken)) {
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

module.exports = { requireAccess, setSessionCookie, COOKIE_NAME };
