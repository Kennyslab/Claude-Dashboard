/** Thin wrapper over the dashboard API, plus the live event stream. */

const base = '';

async function request(path, options = {}) {
  const res = await fetch(base + path, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.method && options.method !== 'GET' ? { 'x-claude-dashboard': '1' } : {}),
      ...options.headers,
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(data?.error || `${res.status} ${res.statusText}`), { status: res.status, data });
  return data;
}

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const api = {
  health: () => request('/api/health'),
  overview: (p) => request(`/api/overview${qs(p)}`),
  analytics: (p) => request(`/api/analytics${qs(p)}`),
  sessions: (p) => request(`/api/sessions${qs(p)}`),
  session: (id, p) => request(`/api/sessions/${encodeURIComponent(id)}${qs(p)}`),
  currentSession: () => request('/api/sessions/current'),
  projects: () => request('/api/projects'),
  inventory: () => request('/api/inventory'),
  settings: () => request('/api/settings'),
  mods: () => request('/api/mods'),
  installMod: (id) => request(`/api/mods/${id}/install`, { method: 'POST' }),
  uninstallMod: (id) => request(`/api/mods/${id}/uninstall`, { method: 'POST' }),
  events: (p) => request(`/api/events${qs(p)}`),
  pricing: () => request('/api/pricing'),
  savePricing: (body) => request('/api/pricing', { method: 'PUT', body: JSON.stringify(body) }),
  refresh: () => request('/api/refresh', { method: 'POST' }),
  exportUrl: (p) => `/api/export${qs(p)}`,
  rawUrl: (id) => `/api/sessions/${encodeURIComponent(id)}/raw`,
};

/**
 * Server-sent events. The browser reconnects on its own, so this only has to
 * fan messages out to subscribers and report connection state.
 */
export function connectStream({ onData, onHook, onState }) {
  let source = null;
  let retry = 0;

  const open = () => {
    source = new EventSource('/api/stream');
    source.addEventListener('hello', () => { retry = 0; onState?.('live'); });
    source.addEventListener('data', (e) => { try { onData?.(JSON.parse(e.data)); } catch {} });
    source.addEventListener('hook', (e) => { try { onHook?.(JSON.parse(e.data)); } catch {} });
    source.onerror = () => {
      onState?.('reconnecting');
      source.close();
      retry = Math.min(retry + 1, 6);
      setTimeout(open, 500 * 2 ** retry);
    };
  };

  open();
  return { close: () => source?.close() };
}
