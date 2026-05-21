// data-client.js
// Auto-selects backend: localhost → server.js file I/O, anywhere else → Netlify /api/db function.
// Override: add ?db=atlas to URL to force remote client from localhost (dev testing).

const DataClient = (() => {
  const forceRemote = new URLSearchParams(window.location.search).get('db') === 'atlas';
  const isLocal = !forceRemote &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // ── LocalClient: wraps existing server.js /api/data/* endpoints ──────────────

  const LocalClient = {
    async get(key) {
      const res = await fetch(`${window.location.origin}/api/data/${key}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      return res.json();
    },
    async save(key, data) {
      const res = await fetch(`${window.location.origin}/api/data/${key}`, {
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
    }
  };

  // ── RemoteClient: calls Netlify /api/db serverless function ──────────────────

  const RemoteClient = {
    async get(key) {
      const res = await fetch(`/api/db?key=${key}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      return res.json();
    },
    async save(key, data) {
      const res = await fetch(`/api/db?key=${key}`, {
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
    }
  };

  return isLocal ? LocalClient : RemoteClient;
})();
