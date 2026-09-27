const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  storeItem: (id) => request(`/api/store-item/${encodeURIComponent(id)}`),
  listProducts: () => request('/api/products'),
  trackProduct: (payload) =>
    request('/api/products', { method: 'POST', body: JSON.stringify(payload) }),
  history: (productId) => request(`/api/products/${productId}/history`),
  log: (productId) => request(`/api/products/${productId}/log`),
  exportCsvUrl: () => `${BASE_URL}/api/export`,
};
