// Books, local edition: serves the dashboard, syncs Gmail on a timer and runs the Telegram bot.
// Start with `npm start`. Settings: finance/.env (run `npm run setup` once).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config.js');
const { Store } = require('./store.js');
const { Ledger } = require('./ledger.js');
const { Gmail } = require('./gmail.js');
const { LLM } = require('./llm.js');
const { Telegram } = require('./telegram.js');
const { Bot } = require('./bot.js');
const { Files } = require('./files.js');
const { Syncer } = require('./sync.js');
const pdf = require('./pdf.js');
const { buildPack, period } = require('./export.js');
const { readInvoice, fetchEmailAttachments } = require('./invoices.js');

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), 'WARN', ...a),
};

function pageHtml(root) {
  const page = fs.readFileSync(path.join(root, 'src/page.html'), 'utf8');
  const parser = fs.readFileSync(path.join(root, 'src/parser.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/gst.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'src/local-runtime.js'), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Books"><meta name="theme-color" content="#0E5C4E">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script>${runtime}</script></head><body>${page.replace('/*@@PARSER@@*/', () => parser)}</body></html>`;
}

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function sameToken(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function cookie(req, name) { const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : null; }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createApp({ cfg, store, ledger, gmail, llm, files, syncer, bot }) {
  const clients = new Set();
  store.on('change', c => { const msg = `data: ${JSON.stringify({ path: c.path, collection: c.collection })}\n\n`; for (const res of clients) res.write(msg); });
  setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

  const send = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const fail = (res, status, error, code) => send(res, status, { error, code });

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://local');
    const ip = req.socket.remoteAddress;
    // Access: this computer always; other devices only with LAN_ACCESS=1 and the access token.
    if (!LOCAL.has(ip)) {
      if (!cfg.lanAccess || !cfg.accessToken) return fail(res, 403, 'Only this computer can open Books.');
      const qt = url.searchParams.get('token');
      if (qt && sameToken(qt, cfg.accessToken)) {
        res.writeHead(302, { 'Set-Cookie': `books_token=${encodeURIComponent(cfg.accessToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`, Location: '/' });
        return res.end();
      }
      if (!sameToken(cookie(req, 'books_token') || '', cfg.accessToken)) return fail(res, 401, 'Open the link with ?token=… from your Books settings.');
    }
    try {
      const p = url.pathname;
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(pageHtml(cfg.root));
      }
      if (req.method === 'GET' && p === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(': hello\n\n'); clients.add(res); req.on('close', () => clients.delete(res));
        return;
      }
      if (p === '/api/db/list' && req.method === 'GET') {
        const where = url.searchParams.get('where');
        const docs = store.list(url.searchParams.get('collection'), {
          orderBy: url.searchParams.get('orderBy') || undefined, dir: url.searchParams.get('dir') || 'asc',
          limit: Number(url.searchParams.get('limit')) || undefined, where: where ? JSON.parse(where) : undefined,
        });
        return send(res, 200, { docs });
      }
      if (p === '/api/db/doc') {
        const dp = url.searchParams.get('path');
        if (req.method === 'GET') return send(res, 200, { data: store.get(dp) ?? null });
        if (req.method === 'DELETE') { store.delete(dp); return send(res, 200, { ok: true }); }
        const body = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8') || '{}');
        if (req.method === 'PUT') { store.set(dp, body); return send(res, 200, { ok: true }); }
        if (req.method === 'PATCH') { store.update(dp, body); return send(res, 200, { ok: true }); }
      }
      if (p === '/api/sync' && req.method === 'POST') {
        const full = url.searchParams.get('full') === '1';
        const r = await syncer.run({ full });
        if (bot) bot.notifySync(r).catch(e => log.warn('telegram notify failed', e.message));
        return send(res, 200, { found: r.lastFound, created: r.created.length, merged: r.merged, aiRead: r.aiRead, unreadable: r.unreadable });
      }
      if (p === '/api/gmail/search' && req.method === 'POST') {
        if (!gmail || !gmail.configured()) return fail(res, 400, 'Gmail is not set up. Run npm run setup.', 'server_not_connected');
        const input = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
        let found = await gmail.search(String(input.query || ''), Math.min(Number(input.pageSize) || 8, 12));
        const t = input.txnId && ledger.txn(input.txnId);
        if (t && found.length && llm && llm.enabled()) {
          try { const r = await llm.rankInvoices(t, found); const order = r.map(x => x.index); found = order.map((i, k) => ({ ...found[i], ai: k === 0 && r[0].match === 'strong', reason: r[k].reason })).concat(found.filter((_, i) => !order.includes(i))); }
          catch (e) { log.warn('invoice ranking failed', e.message); }
        }
        return send(res, 200, { threads: found.map(c => ({ id: c.id, messages: [{ id: c.id, subject: c.subject, sender: c.from, date: c.date, snippet: c.snippet, viewUrl: c.url, ai: !!c.ai, reason: c.reason || '' }] })) });
      }
      if (p === '/api/files' && req.method === 'POST') {
        const buf = await readBody(req, 21 * 1024 * 1024);
        const meta = files.save(buf, decodeURIComponent(req.headers['x-filename'] || 'file'), req.headers['content-type']);
        return send(res, 200, { id: meta.id, url: '/_blob/' + meta.id, sizeBytes: meta.size, contentType: meta.type });
      }
      if (p.startsWith('/_blob/') && req.method === 'GET') {
        const f = files.get(p.slice(7));
        if (!f || !fs.existsSync(f.file)) return fail(res, 404, 'File not found');
        res.writeHead(200, { 'Content-Type': f.meta.type, 'Content-Disposition': `inline; filename="${f.meta.name.replace(/["\\\r\n]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(f.file).pipe(res);
      }
      if (p === '/api/export' && req.method === 'GET') {
        const q = url.searchParams;
        const per = q.get('preset') ? period(q.get('preset')) : { from: q.get('from'), to: q.get('to'), label: '' };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(per.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(per.to || '') || per.from > per.to) return fail(res, 400, 'Choose a valid period.');
        const pack = buildPack({ ledger, store, files }, { entity: q.get('entity') || 'all', ...per });
        if (q.get('send') === 'telegram') {
          if (!bot) return fail(res, 400, 'Telegram is not set up.');
          await bot.tg.sendDocument(pack.buffer, pack.name, `📦 CA pack: ${per.label || per.from + ' to ' + per.to}`);
          return send(res, 200, { sent: true, name: pack.name, counts: pack.counts });
        }
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${pack.name}"`, 'Cache-Control': 'no-store' });
        return res.end(pack.buffer);
      }
      if (p === '/api/invoice/read' && req.method === 'POST') {
        const { txnId } = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
        try { return send(res, 200, { gst: await readInvoice({ ledger, files, llm, gmail }, txnId) }); }
        catch (e) { return fail(res, 400, e.message); }
      }
      if (p === '/api/invoice/fetch' && req.method === 'POST') {
        const { txnId, id } = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
        if (!gmail || !gmail.configured()) return fail(res, 400, 'Gmail is not set up.');
        try { return send(res, 200, { saved: await fetchEmailAttachments({ ledger, files, gmail }, txnId, id) }); }
        catch (e) { return fail(res, 400, e.message); }
      }
      if (p === '/api/statement/pdf' && req.method === 'POST') {
        if (!llm || !llm.enabled() || !cfg.llm.pdf) return fail(res, 400, 'Reading PDF statements needs OpenRouter (and LLM_PDF not set to 0). Use the Excel/CSV statement instead.');
        const buf = await readBody(req, 21 * 1024 * 1024);
        try { return send(res, 200, await pdf.statementFromPdf(buf, decodeURIComponent(req.headers['x-password'] || ''), llm)); }
        catch (e) { return fail(res, 400, e.message, e.code); }
      }
      return fail(res, 404, 'Not found');
    } catch (e) {
      log.warn(req.method, req.url, e.message);
      return fail(res, e.status || 500, e.message);
    }
  };
}

// ---------- background jobs ----------
function startJobs({ cfg, store, syncer, bot, tg }) {
  let gmailAlerted = null;
  const doSync = async () => {
    try {
      const r = await syncer.run();
      if (r.created.length || r.lastFound) log.info(`sync: ${r.lastFound} emails, ${r.created.length} new transactions`);
      if (bot) await bot.notifySync(r);
      gmailAlerted = null;
    } catch (e) {
      log.warn('sync failed:', e.message);
      const today = new Date().toISOString().slice(0, 10);
      if (bot && gmailAlerted !== today) { gmailAlerted = today; bot.tg.send(`⚠️ Books couldn't read Gmail: ${e.message}`).catch(() => {}); }
    }
  };
  setTimeout(doSync, 10000);
  setInterval(doSync, Math.max(5, cfg.syncMinutes) * 60000);

  if (bot) {
    setInterval(async () => {
      const ist = new Date(Date.now() + 330 * 60000).toISOString();
      const day = ist.slice(0, 10), hm = ist.slice(11, 16);
      const last = (store.get('meta/digest') || {}).day;
      if (hm >= cfg.digestTime && last !== day) {
        store.set('meta/digest', { day });
        bot.digest().catch(e => log.warn('digest failed', e.message));
      }
    }, 60000);

    (async function poll() {
      tg.setCommands().catch(() => {});
      let offset = (store.get('meta/telegram') || {}).offset || 0;
      for (;;) {
        try {
          const ups = await tg.updates(offset, 50);
          for (const u of ups) {
            offset = u.update_id + 1;
            store.set('meta/telegram', { offset });
            await bot.handle(u).catch(e => log.warn('telegram update failed', e.message));
          }
        } catch (e) { log.warn('telegram poll:', e.message); await new Promise(r => setTimeout(r, (e.retryAfter || 5) * 1000)); }
      }
    })();
  }
}

function main() {
  const cfg = config.load();
  const store = new Store(cfg.dbFile);
  const ledger = new Ledger(store);
  const gmail = new Gmail(cfg.gmail);
  const llm = new LLM(cfg.llm, store);
  const files = new Files(cfg.filesDir, store);
  const syncer = new Syncer({ store, ledger, gmail, llm, log });
  const tg = new Telegram(cfg.telegram);
  const host = cfg.lanAccess ? '0.0.0.0' : '127.0.0.1';
  const dashboardUrl = `http://${cfg.lanAccess ? require('os').hostname().replace(/\.local$/i, '') + '.local' : 'localhost'}:${cfg.port}/`;
  const bot = tg.configured() ? new Bot({ tg, store, ledger, gmail, llm, files, syncer, cfg: { dashboardUrl }, log }) : null;
  if (!(store.get('meta/settings') || {}).since) store.set('meta/settings', { ...(store.get('meta/settings') || {}), since: '2026-04-01' });

  http.createServer(createApp({ cfg, store, ledger, gmail, llm, files, syncer, bot })).listen(cfg.port, host, () => {
    log.info(`Books running at http://localhost:${cfg.port}/`);
    if (cfg.lanAccess) log.info(`On your phone (same Wi-Fi): ${dashboardUrl}?token=${cfg.accessToken ? '<ACCESS_TOKEN from .env>' : '(set ACCESS_TOKEN first)'}`);
    log.info(`Gmail: ${gmail.configured() ? cfg.gmail.user : 'not set up'} · Telegram: ${bot ? 'on' : 'off'} · OpenRouter: ${llm.enabled() ? cfg.llm.model : 'off'}`);
  });
  startJobs({ cfg, store, syncer, bot, tg });
}

if (require.main === module) main();

module.exports = { createApp, pageHtml };
