// Document store on SQLite with the same shape the page's runtime expects:
// documents at "collection/id" paths, JSON bodies, set / update (deep merge) / delete.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// Nested objects merge; arrays and scalars replace. Same rule the page code relies on.
function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

function splitPath(p) {
  const parts = String(p).split('/');
  if (parts.length < 2 || parts.length % 2 || parts.some(s => !/^[A-Za-z0-9_.~:@+-]{1,200}$/.test(s))) throw new Error(`bad document path: ${p}`);
  return { collection: parts.slice(0, -1).join('/'), id: parts[parts.length - 1] };
}

class Store extends EventEmitter {
  constructor(file) {
    super();
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS docs_collection ON docs(collection);`);
    this.q = {
      get: this.db.prepare('SELECT data, version FROM docs WHERE path = ?'),
      put: this.db.prepare('INSERT INTO docs (path, collection, id, data, version, updated) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, version = docs.version + 1, updated = excluded.updated'),
      del: this.db.prepare('DELETE FROM docs WHERE path = ?'),
      list: this.db.prepare('SELECT id, data FROM docs WHERE collection = ?'),
    };
  }

  get(p) { splitPath(p); const r = this.q.get.get(p); return r ? JSON.parse(r.data) : undefined; }

  set(p, data) {
    if (!isObj(data)) throw new Error('document body must be an object');
    const { collection, id } = splitPath(p);
    this.q.put.run(p, collection, id, JSON.stringify(data), Date.now());
    this.emit('change', { path: p, collection });
  }

  update(p, patch) {
    const cur = this.get(p);
    if (!cur) throw new Error(`no document at ${p}`);
    this.set(p, deepMerge(cur, patch));
  }

  delete(p) { const { collection } = splitPath(p); this.q.del.run(p); this.emit('change', { path: p, collection }); }

  // list('txns', {orderBy: 'date', dir: 'desc', limit: 1000, where: [['status','==','todo']]})
  list(collection, opts = {}) {
    let rows = this.q.list.all(collection).map(r => ({ id: r.id, data: JSON.parse(r.data) }));
    for (const [f, op, v] of opts.where || []) {
      rows = rows.filter(r => {
        const x = r.data[f];
        switch (op) {
          case '==': return x === v;
          case '!=': return x !== v;
          case '<': return x < v;
          case '<=': return x <= v;
          case '>': return x > v;
          case '>=': return x >= v;
          case 'in': return v.includes(x);
          default: throw new Error(`unsupported operator ${op}`);
        }
      });
    }
    if (opts.orderBy) {
      const f = opts.orderBy, sign = opts.dir === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        const x = a.data[f], y = b.data[f];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * sign;
      });
    } else rows.sort((a, b) => (a.id < b.id ? -1 : 1));
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return rows;
  }

  values(collection, opts) { return this.list(collection, opts).map(r => ({ ...r.data, id: r.data.id || r.id })); }

  close() { this.db.close(); }
}

module.exports = { Store, deepMerge };
