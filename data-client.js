// data-client.js
// Auto-selects backend: localhost → server.js file I/O, anywhere else → MongoDB Atlas Data API.
// Override: add ?db=atlas to URL to force Atlas from localhost (dev testing).

const DataClient = (() => {
  const forceAtlas = new URLSearchParams(window.location.search).get('db') === 'atlas';
  const isLocal = !forceAtlas &&
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
    }
  };

  // ── AtlasClient: MongoDB Atlas Data API (pure fetch, no SDK) ─────────────────

  const SINGLE_DOC_KEYS = new Set(['spars', 'schedule', 'buckets']);

  const AtlasClient = {
    _cfg() {
      if (!window.ATLAS_CONFIG) throw new Error('atlas-config.js not loaded or has placeholder values');
      return window.ATLAS_CONFIG;
    },
    async _action(action, body) {
      const cfg = this._cfg();
      const res = await fetch(`${cfg.baseUrl}/action/${action}`, {
        method: 'POST',
        headers: { 'api-key': cfg.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataSource: cfg.dataSource, database: cfg.database, ...body })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Atlas ${action} failed: ${err.error || res.statusText}`);
      }
      return res.json();
    },
    async get(key) {
      if (SINGLE_DOC_KEYS.has(key)) {
        const r = await this._action('findOne', { collection: key, filter: { _id: 'current' } });
        if (!r.document) return null;
        const { _id, ...data } = r.document;
        return data;
      }
      const r = await this._action('find', { collection: key, filter: {} });
      return (r.documents || []).map(({ _id, ...d }) => d);
    },
    async save(key, data) {
      if (SINGLE_DOC_KEYS.has(key)) {
        await this._action('replaceOne', {
          collection: key,
          filter: { _id: 'current' },
          replacement: { _id: 'current', ...data },
          upsert: true
        });
      } else {
        await this._action('deleteMany', { collection: key, filter: {} });
        if (Array.isArray(data) && data.length > 0) {
          await this._action('insertMany', { collection: key, documents: data });
        }
      }
    }
  };

  return isLocal ? LocalClient : AtlasClient;
})();
