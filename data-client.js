// data-client.js
// Auto-selects backend: localhost → server.js file I/O, anywhere else → Netlify /api/db function.
// Override: add ?db=atlas to URL to force remote client from localhost (dev testing).

const DataClient = (() => {
  const forceRemote = new URLSearchParams(window.location.search).get('db') === 'atlas';
  const isLocal = !forceRemote &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // ── LocalClient: wraps existing server.js /api/data/* endpoints ──────────────

  const LocalClient = {
    async get(key, { date } = {}) {
      const qs = date ? `?date=${date}` : '';
      const res = await fetch(`${window.location.origin}/api/data/${key}${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      return res.json();
    },
    async save(key, data, { date } = {}) {
      const qs = date ? `?date=${date}` : '';
      const res = await fetch(`${window.location.origin}/api/data/${key}${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    },
    async patch(key, id, fields) {
      const res = await fetch(`${window.location.origin}/api/data/${key}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    },
    async getDates(key) {
      const res = await fetch(`${window.location.origin}/api/spar-dates`);
      if (!res.ok) return [];
      return res.json();
    },
    async getVersion() {
      const res = await fetch(`${window.location.origin}/api/version`);
      if (!res.ok) return null;
      return (await res.json()).version;
    }
  };

  // ── RemoteClient: calls Netlify /api/db serverless function ──────────────────

  const RemoteClient = {
    async get(key, { date } = {}) {
      const params = new URLSearchParams({ key });
      if (date) params.set('date', date);
      const res = await fetch(`/api/db?${params}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      return res.json();
    },
    async save(key, data, { date } = {}) {
      const params = new URLSearchParams({ key });
      if (date) params.set('date', date);
      const res = await fetch(`/api/db?${params}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    },
    async patch(key, id, fields) {
      const res = await fetch(`/api/db?key=${key}&id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    },
    async getDates(key) {
      const res = await fetch(`/api/db?key=${key}&dates=1`);
      if (!res.ok) return [];
      return res.json();
    },
    async getVersion() {
      const res = await fetch('/api/get-version');
      if (!res.ok) return null;
      return (await res.json()).version;
    }
  };

  return isLocal ? LocalClient : RemoteClient;
})();
