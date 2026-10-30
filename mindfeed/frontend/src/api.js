const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function getToken() {
  return localStorage.getItem('mindfeed_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('mindfeed_token', token);
  else localStorage.removeItem('mindfeed_token');
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const type = response.headers.get('content-type') || '';
  let data;
  if (type.includes('application/json')) data = await response.json();
  else data = await response.text();
  if (!response.ok) {
    const message = typeof data === 'object' ? (data.detail || data.message || 'Something went wrong.') : 'Something went wrong.';
    throw new Error(Array.isArray(message) ? message.map(x => x.msg || String(x)).join(', ') : String(message));
  }
  return data;
}

export function formatTime(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  const delta = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function initials(name = 'MindFeed') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}
