const { getOperatingCredential } = require('../config');

// Dunne wrapper rond Home Assistant's REST API. Werkt zowel via de
// Supervisor-proxy (http://supervisor/core/api, add-on-modus) als
// rechtstreeks tegen een Home Assistant-URL (standalone-modus) -- de
// aanroeper hoeft het verschil niet te kennen.
async function haFetch(pathSuffix, { method = 'GET', body, query } = {}) {
  const cred = getOperatingCredential();
  if (!cred) {
    const err = new Error('Home Assistant is nog niet gekoppeld aan deze app.');
    err.code = 'HA_NOT_CONFIGURED';
    throw err;
  }

  let url = `${cred.baseUrl}${pathSuffix}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cred.token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Home Assistant API-fout (${res.status} op ${pathSuffix}): ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

// Los van getOperatingCredential(): controleert of een door de gebruiker
// aangeleverd token (pairing-scherm) daadwerkelijk toegang geeft tot de
// opgegeven Home Assistant-instantie, ongeacht wat de server zelf al als
// credential gebruikt. Onderscheidt "kon Home Assistant niet bereiken"
// (netwerk-/adresprobleem) van "bereikt, maar het token klopt niet" --
// twee heel verschillende dingen om aan een gebruiker te melden.
async function validateToken(baseUrl, token) {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/`;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    return { ok: false, reason: 'unreachable', detail: err.message };
  }
  if (!res.ok) {
    return { ok: false, reason: res.status === 401 || res.status === 403 ? 'unauthorized' : 'error', status: res.status };
  }
  return { ok: true };
}

module.exports = { haFetch, validateToken };
