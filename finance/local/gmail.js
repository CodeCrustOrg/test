// Gmail over IMAP (imap.gmail.com) with an app password. Read-only: the mailbox is opened read-only
// and nothing is moved, flagged or deleted.
const { ImapFlow } = require('imapflow');

const ALERT_SENDERS = ['alerts@hdfcbank.bank.in', 'alerts@hdfcbank.net', 'indusind_bank@indusind.com'];

function webUrl(user, emailId) {
  if (!emailId) return null;
  const hex = BigInt(emailId).toString(16);
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(user)}#all/${hex}`;
}
function msgId(emailId) { return emailId ? BigInt(emailId).toString(16) : null; }

// Walk an IMAP body structure and collect text parts and attachments.
function partsOf(node, out = { text: null, html: null, files: [] }) {
  if (!node) return out;
  if (node.childNodes && node.childNodes.length) { node.childNodes.forEach(n => partsOf(n, out)); return out; }
  const type = (node.type || '').toLowerCase();
  const disp = (node.disposition || '').toLowerCase();
  const name = (node.dispositionParameters && node.dispositionParameters.filename) || (node.parameters && node.parameters.name) || null;
  if (disp === 'attachment' || (name && !type.startsWith('text/'))) out.files.push({ part: node.part || '1', filename: name || 'attachment', type, size: node.size || 0 });
  else if (type === 'text/plain' && !out.text) out.text = node.part || '1';
  else if (type === 'text/html' && !out.html) out.html = node.part || '1';
  return out;
}

async function readStream(stream, limit = 2 * 1024 * 1024) {
  const chunks = []; let n = 0;
  for await (const c of stream) { n += c.length; if (n > limit) break; chunks.push(c); }
  return Buffer.concat(chunks);
}

class Gmail {
  constructor({ user, pass }) { this.user = user; this.pass = pass; this.mailbox = null; }

  configured() { return !!(this.user && this.pass); }

  async withClient(fn) {
    const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: this.user, pass: this.pass }, logger: false });
    await client.connect();
    try {
      if (!this.mailbox) {
        const boxes = await client.list();
        const all = boxes.find(b => b.specialUse === '\\All');
        this.mailbox = all ? all.path : '[Gmail]/All Mail';
      }
      const lock = await client.getMailboxLock(this.mailbox, { readOnly: true });
      try { return await fn(client); } finally { lock.release(); }
    } finally { await client.logout().catch(() => {}); }
  }

  async headers(client, uids) {
    const out = [];
    if (!uids.length) return out;
    for await (const m of client.fetch(uids, { uid: true, envelope: true, bodyStructure: true, emailId: true, internalDate: true }, { uid: true })) {
      const from = m.envelope && m.envelope.from && m.envelope.from[0] ? m.envelope.from[0].address : '';
      out.push({ uid: m.uid, id: msgId(m.emailId), url: webUrl(this.user, m.emailId), from, subject: (m.envelope && m.envelope.subject) || '', date: (m.envelope && m.envelope.date || m.internalDate || new Date()).toISOString(), parts: partsOf(m.bodyStructure) });
    }
    return out;
  }

  async text(client, h) {
    const get = async part => { if (!part) return ''; const { content } = await client.download(String(h.uid), part, { uid: true }); return content ? (await readStream(content)).toString('utf8') : ''; };
    return { body: await get(h.parts.text), html: await get(h.parts.html) };
  }

  // New bank alert emails since `since` (YYYY-MM-DD), skipping message ids in `seen`.
  async fetchAlerts(since, seen = new Set(), onProgress = () => {}) {
    return this.withClient(async client => {
      const q = `from:(${ALERT_SENDERS.join(' OR ')}) after:${since.replace(/-/g, '/')}`;
      const uids = await client.search({ gmraw: q }, { uid: true }) || [];
      const hs = (await this.headers(client, uids)).filter(h => !seen.has(h.id) && ALERT_SENDERS.some(s => h.from.toLowerCase().includes(s)));
      const out = [];
      for (const h of hs) { out.push({ ...h, ...(await this.text(client, h)) }); onProgress(out.length, hs.length); }
      return out;
    });
  }

  // Invoice candidates: newest first, with a text snippet and attachment list.
  async search(query, max = 8) {
    return this.withClient(async client => {
      const uids = (await client.search({ gmraw: query }, { uid: true }) || []).slice(-max).reverse();
      const hs = await this.headers(client, uids);
      for (const h of hs) { const t = await this.text(client, h); h.snippet = (t.body || t.html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 300); }
      return hs;
    });
  }

  async attachment(uid, part) {
    return this.withClient(async client => {
      const { content } = await client.download(String(uid), part, { uid: true });
      if (!content) throw new Error('attachment not found');
      return readStream(content, 20 * 1024 * 1024);
    });
  }

  // Quick check used by setup: can we log in, and how many alert emails exist?
  async check(since) {
    return this.withClient(async client => {
      const q = `from:(${ALERT_SENDERS.join(' OR ')}) after:${since.replace(/-/g, '/')}`;
      const uids = await client.search({ gmraw: q }, { uid: true }) || [];
      return { mailbox: this.mailbox, alerts: uids.length };
    });
  }
}

module.exports = { Gmail, ALERT_SENDERS, partsOf, webUrl };
