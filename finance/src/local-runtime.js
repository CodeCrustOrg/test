// Browser side of the local app: gives page.html the same window.claude.use(...) interface it
// uses on claude.ai, backed by the Books server on this computer.
(function () {
  'use strict';
  window.BOOKS_LOCAL = true;

  async function api(method, url, body, headers) {
    let res;
    try {
      res = await fetch(url, { method, headers: body instanceof Blob ? headers : { 'Content-Type': 'application/json', ...(headers || {}) }, body: body == null ? undefined : body instanceof Blob ? body : JSON.stringify(body), credentials: 'same-origin' });
    } catch (e) { throw { code: 'unavailable', message: 'Books server is not running on this computer.' }; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { code: data.code || (res.status === 401 ? 'revoked' : 'invalid_argument'), message: data.error || `HTTP ${res.status}` };
    return data;
  }

  // ---- db: documents + live updates over server-sent events ----
  const subs = new Set();
  const freeze = o => Object.freeze(o);
  const docSnap = (id, data) => freeze({ id, exists: data !== undefined && data !== null, data: () => (data == null ? undefined : JSON.parse(JSON.stringify(data))), metadata: { fromCache: false, hasPendingWrites: false } });

  function docRef(path) {
    const id = path.split('/').pop();
    const get = async () => docSnap(id, (await api('GET', '/api/db/doc?path=' + encodeURIComponent(path))).data);
    return {
      id, path, get,
      set: data => api('PUT', '/api/db/doc?path=' + encodeURIComponent(path), data).then(() => undefined),
      update: data => api('PATCH', '/api/db/doc?path=' + encodeURIComponent(path), data).then(() => undefined),
      delete: () => api('DELETE', '/api/db/doc?path=' + encodeURIComponent(path)).then(() => undefined),
      onSnapshot(next, error) {
        const sub = { match: c => c.path === path, run: () => get().then(next, e => error && error(e)) };
        subs.add(sub); sub.run();
        return () => subs.delete(sub);
      },
      collection: sub => query(path + '/' + sub),
    };
  }

  function query(collection, opts = {}) {
    const run = async () => {
      const qs = new URLSearchParams({ collection });
      if (opts.orderBy) { qs.set('orderBy', opts.orderBy); qs.set('dir', opts.dir || 'asc'); }
      if (opts.limit) qs.set('limit', opts.limit);
      if (opts.where && opts.where.length) qs.set('where', JSON.stringify(opts.where));
      const { docs } = await api('GET', '/api/db/list?' + qs);
      const snaps = docs.map(d => docSnap(d.id, d.data));
      return freeze({ docs: snaps, size: snaps.length, empty: !snaps.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
    };
    return {
      path: collection,
      where: (f, op, v) => query(collection, { ...opts, where: (opts.where || []).concat([[f, op, v]]) }),
      orderBy: (f, dir) => query(collection, { ...opts, orderBy: f, dir: dir || 'asc' }),
      limit: n => query(collection, { ...opts, limit: n }),
      get: run,
      onSnapshot(next, error) {
        const sub = { match: c => c.collection === collection, run: () => run().then(next, e => error && error(e)) };
        subs.add(sub); sub.run();
        return () => subs.delete(sub);
      },
      doc: id => docRef(collection + '/' + (id || Math.random().toString(36).slice(2, 12))),
      add: async data => { const r = docRef(collection + '/' + Math.random().toString(36).slice(2, 12)); await r.set(data); return r; },
    };
  }

  // Coalesce bursts of changes (a sync writes many documents) into one refresh per subscription.
  let pending = new Map(), timer = null;
  function onChange(c) {
    for (const s of subs) if (s.match(c)) pending.set(s, true);
    if (!timer) timer = setTimeout(() => { const list = [...pending.keys()]; pending = new Map(); timer = null; list.forEach(s => subs.has(s) && s.run()); }, 150);
  }
  function listen() {
    const es = new EventSource('/api/events');
    es.onmessage = ev => { try { onChange(JSON.parse(ev.data)); } catch (_) {} };
    es.onerror = () => { es.close(); setTimeout(() => { listen(); subs.forEach(s => s.run()); }, 3000); };
  }
  listen();

  const db = freeze({ doc: docRef, collection: c => query(c) });

  // ---- mcp: only the Gmail search the invoice finder uses ----
  const mcp = freeze({
    async callTool(server, tool, input) {
      if (server !== 'Gmail' || tool !== 'search_threads') throw { code: 'not_in_manifest', message: 'Not available in the local app' };
      return { content: [], payload: await api('POST', '/api/gmail/search', input) };
    },
    async listTools() { return { servers: [{ server: 'Gmail', authStatus: 'connected', tools: [{ name: 'search_threads', description: '' }] }] }; },
  });

  const assets = freeze({
    async upload(blob, options) {
      const type = (options && options.type) || blob.type || 'application/octet-stream';
      const r = await api('POST', '/api/files', blob, { 'Content-Type': type, 'X-Filename': encodeURIComponent(blob.name || 'file') });
      return r;
    },
  });

  const downloads = freeze({
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return { status: 'saved' };
    },
  });

  const caps = { db, mcp, assets, downloads };
  window.claude = freeze({ use: async name => caps[name] || null });
  window.booksApi = api;
})();
