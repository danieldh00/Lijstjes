async function request(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.message || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }
  return data;
}

const api = {
  status: () => request('/api/auth/status'),
  pair: (haUrl, token) => request('/api/auth/pair', { method: 'POST', body: { ha_url: haUrl, token } }),
  unpair: () => request('/api/auth/unpair', { method: 'POST' }),
  content: () => request('/api/content'),
  sync: (mutations) => request('/api/sync', { method: 'POST', body: { mutations } }),
  pushVapidKey: () => request('/api/push/vapid-public-key'),
  pushSubscribe: (subscription) => request('/api/push/subscribe', { method: 'POST', body: { subscription } }),
};

export default api;
