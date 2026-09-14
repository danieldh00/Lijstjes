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
  content: () => request('/api/content'),
  sync: (mutations) => request('/api/sync', { method: 'POST', body: { mutations } }),
  pushVapidKey: () => request('/api/push/vapid-public-key'),
  pushSubscribe: (subscription) => request('/api/push/subscribe', { method: 'POST', body: { subscription } }),
  templates: () => request('/api/templates'),
  createTemplate: (data) => request('/api/templates', { method: 'POST', body: data }),
  deleteTemplate: (id) => request(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  stores: () => request('/api/stores'),
  createStore: (data) => request('/api/stores', { method: 'POST', body: data }),
  deleteStore: (id) => request(`/api/stores/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listSettings: () => request('/api/list-settings'),
  setListSettings: (data) => request('/api/list-settings', { method: 'POST', body: data }),
  listOrder: () => request('/api/list-order'),
  setListOrder: (order) => request('/api/list-order', { method: 'POST', body: { order } }),
};

export default api;
