// Invoice files (uploads, Telegram attachments, email attachments) live in data/files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' };

class Files {
  constructor(dir, store) { this.dir = dir; this.store = store; fs.mkdirSync(dir, { recursive: true }); }

  save(buf, name, type) {
    if (!buf || !buf.length) throw new Error('empty file');
    if (buf.length > 20 * 1024 * 1024) throw new Error('file is over 20 MB');
    const t = String(type || '').toLowerCase().split(';')[0];
    if (!TYPES[t]) throw new Error('only PDF and image files can be attached');
    const id = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(path.join(this.dir, id + TYPES[t]), buf);
    const meta = { id, name: String(name || 'file').slice(0, 200), type: t, size: buf.length, created: Date.now() };
    this.store.set('files/' + id, meta);
    return meta;
  }

  get(id) {
    if (!/^[0-9a-f]{32}$/.test(id)) return null;
    const meta = this.store.get('files/' + id);
    if (!meta) return null;
    return { meta, file: path.join(this.dir, id + TYPES[meta.type]) };
  }
}

module.exports = { Files, TYPES };
