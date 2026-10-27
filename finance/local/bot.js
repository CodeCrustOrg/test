// What the Telegram bot says and how it reacts to button taps and replies.
// Each bot message about a transaction is remembered as tg/<message_id> -> {txn}.
const P = require('../src/parser.js');
const { ENTITIES, KINDS } = require('./ledger.js');

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dShort = d => d ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}` : '';
const money = t => `${t.dir === 'out' ? '−' : '+'}${P.fmtINR(t.paise)}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

class Bot {
  constructor({ tg, store, ledger, gmail, llm, files, syncer, cfg = {}, log = console }) {
    Object.assign(this, { tg, store, ledger, gmail, llm, files, syncer, cfg, log });
  }

  // ---------- message text ----------
  head(t) {
    const ent = ENTITIES[this.ledger.entityOf(t)] || 'Unassigned';
    const who = t.party || (t.vpa || '').replace(/^\*+/, '') || t.stmtNarr || t.narr || 'Unknown payee';
    const ref = [t.mode, t.ref].filter(Boolean).join(' ');
    let s = `${t.dir === 'out' ? '🟠' : '🔵'} <b>${money(t)}</b> · ${esc(ent)}\n${esc(clip(who, 80))}\n<i>${esc(this.ledger.acctName(t.acct))} · ${dShort(t.date)}${ref ? ' · ' + esc(ref) : ''}</i>`;
    if (t.review) s += `\n⚠️ ${esc(t.review)}`;
    return s;
  }

  labelLine(t) {
    if (t.status !== 'done' || !t.kind) return '';
    return `\n✅ ${esc(KINDS[t.kind][t.dir])}${t.kind === 'business' && t.cat ? ' · ' + esc(t.cat) : ''}${t.auto ? ' (your rule)' : ''}`;
  }

  invoiceLine(t) {
    const inv = t.inv || {};
    if (inv.state === 'attached') return `\n📎 Invoice attached`;
    if (inv.state === 'not_needed') return '';
    if (this.ledger.needsInvoice(t)) return `\n🧾 Invoice needed. Reply to this message with a photo or PDF, or find it in your email.`;
    return '';
  }

  kindKeyboard(t) {
    const kb = [];
    if (t.suggest && t.suggest.kind) {
      const l = t.suggest.kind === 'business' ? t.suggest.cat : KINDS[t.suggest.kind][t.dir];
      kb.push([{ text: `✓ ${clip(l, 40)}`, callback_data: 's' }]);
    }
    kb.push([{ text: KINDS.business[t.dir], callback_data: 'k|business' }, { text: 'Inter-company', callback_data: 'k|intercompany' }]);
    kb.push([{ text: 'Own transfer', callback_data: 'k|transfer' }, { text: 'Personal', callback_data: 'k|personal' }]);
    return kb;
  }

  catKeyboard(t) {
    const cats = this.ledger.cats(t.dir); const kb = [];
    for (let i = 0; i < cats.length; i += 2) kb.push(cats.slice(i, i + 2).map((c, j) => ({ text: clip(c, 30), callback_data: `c|${i + j}` })));
    kb.push([{ text: '« Back', callback_data: 'b' }]);
    return kb;
  }

  invoiceKeyboard() { return [[{ text: '🔎 Find in email', callback_data: 'f' }, { text: 'Not needed', callback_data: 'n' }]]; }

  view(t) {
    if (t.status === 'todo') {
      const sug = t.suggest ? `\n💡 Suggested: ${esc(t.suggest.kind === 'business' ? t.suggest.cat : KINDS[t.suggest.kind][t.dir])}${t.suggest.why ? ` (${esc(t.suggest.why)})` : ''}` : '';
      return { text: this.head(t) + sug + '\n\nWhat is this? Reply with text to add a note.', kb: this.kindKeyboard(t) };
    }
    const needs = this.ledger.needsInvoice(t);
    return { text: this.head(t) + this.labelLine(t) + (t.note ? `\n📝 ${esc(t.note)}` : '') + this.invoiceLine(t), kb: needs ? this.invoiceKeyboard() : [] };
  }

  async post(t) {
    const v = this.view(t);
    const m = await this.tg.send(v.text, v.kb);
    this.store.set('tg/' + m.message_id, { txn: t.id, sent: Date.now() });
    return m;
  }

  async refresh(messageId, t, extra = '') { const v = this.view(t); await this.tg.edit(messageId, v.text + extra, v.kb); }

  // ---------- outbound ----------
  async notifySync(res) {
    for (const a of res.newAccounts || []) {
      const m = await this.tg.send(`🏦 New account in your alerts: <b>${esc(this.ledger.acctName(a.id))}</b>. Whose is it?`,
        [Object.entries(ENTITIES).map(([k, l]) => ({ text: l, callback_data: `e|${k}` })).concat([{ text: "Don't track", callback_data: 'e|ignore' }])]);
      this.store.set('tg/' + m.message_id, { acct: a.id });
    }
    const items = (res.created || []).filter(t => this.ledger.tracked(t) && (t.status === 'todo' || this.ledger.needsInvoice(t)));
    const shown = items.slice(0, 15);
    for (const t of shown) { await this.post(t); await sleep(1100); }
    if (items.length > shown.length) await this.tg.send(`…and ${items.length - shown.length} more. Send /todo to see them, or open the dashboard.`);
  }

  async sendTodo(limit = 5) {
    const all = this.ledger.txns().filter(t => this.ledger.tracked(t));
    const todo = all.filter(t => t.status === 'todo').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const inv = all.filter(t => this.ledger.needsInvoice(t)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!todo.length && !inv.length) return this.tg.send('✅ Nothing waiting. Every transaction is labelled and every business expense has its invoice.');
    await this.tg.send(`<b>${todo.length}</b> to label, <b>${inv.length}</b> missing an invoice. Newest first:`);
    for (const t of todo.concat(inv).slice(0, limit)) { await this.post(t); await sleep(1100); }
  }

  summaryText(prefix, title) {
    const tot = this.ledger.totals(prefix); const c = this.ledger.counts();
    const lines = Object.entries(ENTITIES).map(([k, l]) => `<b>${esc(l)}</b>: in ${P.fmtINR(tot[k].in)} · out ${P.fmtINR(tot[k].out)} · net ${P.fmtINR(tot[k].in - tot[k].out)}`);
    return `📊 <b>${esc(title)}</b>\n${lines.join('\n')}\n\n${c.label} to label · ${c.invoice} missing invoices${c.stmt ? ` · ${c.stmt} alerts not on a statement` : ''}`;
  }

  // Morning message: yesterday's activity plus what is waiting, and the statement reminder early in the month.
  async digest(now = new Date()) {
    const ist = new Date(now.getTime() + 330 * 60000);
    const y = new Date(ist.getTime() - 86400000).toISOString().slice(0, 10);
    const yt = this.ledger.txns().filter(t => this.ledger.tracked(t) && t.date === y);
    let s = this.summaryText(y, `Yesterday, ${dShort(y)}: ${yt.length} transaction${yt.length === 1 ? '' : 's'}`);
    const day = ist.getUTCDate();
    if (day >= 2 && day <= 7) {
      const pm = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
      const accts = this.store.values('accounts').filter(a => ENTITIES[a.entity]);
      const missing = accts.filter(a => !this.store.values('statements').some(st => st.acct === a.id && st.to >= pm + '-25'));
      if (missing.length) s += `\n\n🗓 Time to import ${MON[+pm.slice(5) - 1]} statements for ${missing.map(a => esc(this.ledger.acctName(a.id))).join(' and ')}: download Excel/CSV (or PDF) from net banking and add it under Statements in the dashboard.`;
    }
    return this.tg.send(s);
  }

  // ---------- inbound ----------
  async handle(u) {
    const from = u.callback_query ? u.callback_query.message && u.callback_query.message.chat : u.message && u.message.chat;
    if (!from || String(from.id) !== this.tg.chatId) return; // ignore everyone else
    if (u.callback_query) return this.onButton(u.callback_query);
    if (u.message) return this.onMessage(u.message);
  }

  async onButton(q) {
    const mid = q.message.message_id; const ctx = this.store.get('tg/' + mid);
    const [act, arg] = String(q.data || '').split('|');
    if (!ctx) { await this.tg.answer(q.id, 'This message is too old. Use /todo or the dashboard.'); return; }
    try {
      if (act === 'e') {
        this.store.update('accounts/' + ctx.acct, { entity: arg }); this.ledger.pairInterCompany();
        await this.tg.answer(q.id, 'Saved');
        return this.tg.edit(mid, `🏦 ${esc(this.ledger.acctName(ctx.acct))} → <b>${esc(ENTITIES[arg] || "Not tracked")}</b>`, []);
      }
      let t = this.ledger.txn(ctx.txn);
      if (!t) { await this.tg.answer(q.id, 'Transaction no longer exists'); return; }
      if (act === 's' && t.suggest) t = this.ledger.label(t.id, { kind: t.suggest.kind, cat: t.suggest.cat });
      else if (act === 'k' && arg === 'business') { await this.tg.answer(q.id); return this.tg.edit(mid, this.head(t) + '\n\nWhich category?', this.catKeyboard(t)); }
      else if (act === 'k') t = this.ledger.label(t.id, { kind: arg });
      else if (act === 'c') { const cat = this.ledger.cats(t.dir)[+arg]; if (!cat) throw new Error('category list changed, try again'); t = this.ledger.label(t.id, { kind: 'business', cat }); }
      else if (act === 'b') { /* back: just re-render */ }
      else if (act === 'n') { this.ledger.setInvoiceNotNeeded(t.id); t = this.ledger.txn(t.id); }
      else if (act === 'f') { await this.tg.answer(q.id, 'Searching your email…'); return this.findInvoice(mid, t, ctx); }
      else if (act === 'x') { /* none of the candidates */ }
      else if (act === 'a') { await this.tg.answer(q.id, 'Attaching…'); return this.attachCandidate(mid, t, ctx, +arg); }
      await this.tg.answer(q.id, 'Saved');
      return this.refresh(mid, t);
    } catch (e) {
      this.log.warn('button failed', e.message);
      await this.tg.answer(q.id, 'Not saved: ' + clip(e.message, 150));
    }
  }

  async findInvoice(mid, t, ctx) {
    if (!this.gmail || !this.gmail.configured()) return this.refresh(mid, t, '\n\n⚠️ Gmail is not set up on the computer running Books.');
    let cands = [];
    try {
      const seen = new Set();
      for (const q of [P.invoiceQuery(t), t.party ? P.invoiceQuery(t, 'party') : null].filter(Boolean)) {
        for (const c of await this.gmail.search(q, 6)) if (!seen.has(c.id)) { seen.add(c.id); cands.push(c); }
      }
    } catch (e) { return this.refresh(mid, t, `\n\n⚠️ Email search failed: ${esc(e.message)}`); }
    let ranked = cands.map((c, i) => ({ index: i, match: 'possible', reason: '' }));
    if (cands.length && this.llm && this.llm.enabled()) { try { ranked = await this.llm.rankInvoices(t, cands); } catch (e) { this.log.warn('ranking failed', e.message); } }
    const top = ranked.slice(0, 4);
    this.store.update('tg/' + mid, { cands: top.map(r => { const c = cands[r.index]; return { id: c.id, uid: c.uid, url: c.url, subject: c.subject, from: c.from, date: c.date, files: (c.parts && c.parts.files) || [], match: r.match, reason: r.reason }; }) });
    if (!top.length) return this.tg.edit(mid, this.head(t) + this.labelLine(t) + '\n\n🔎 No matching emails from a week before to four days after the payment. Reply with a photo or PDF of the bill instead.', this.invoiceKeyboard());
    const list = top.map((r, i) => { const c = cands[r.index]; return `${i + 1}. ${r.match === 'strong' ? '⭐ ' : ''}${esc(clip(c.subject || '(no subject)', 70))}\n   <i>${esc(c.from)} · ${dShort((c.date || '').slice(0, 10))}${r.reason ? ' · ' + esc(r.reason) : ''}</i>`; }).join('\n');
    const kb = [top.map((_, i) => ({ text: `Attach ${i + 1}`, callback_data: `a|${i}` })), [{ text: 'None of these', callback_data: 'x' }, { text: 'Not needed', callback_data: 'n' }]];
    return this.tg.edit(mid, this.head(t) + this.labelLine(t) + '\n\n🔎 Possible invoices:\n' + list, kb);
  }

  async attachCandidate(mid, t, ctx, i) {
    const c = (this.store.get('tg/' + mid).cands || [])[i];
    if (!c) return this.refresh(mid, t);
    this.ledger.attachInvoice(t.id, { type: 'gmail', id: c.id, url: c.url, subject: c.subject || '', from: c.from || '', date: c.date || '' });
    const f = c.files.find(x => /pdf|image\//.test(x.type) && (!x.size || x.size < 15 * 1024 * 1024));
    let extra = '';
    if (f && this.files) {
      try { const buf = await this.gmail.attachment(c.uid, f.part); const meta = this.files.save(buf, f.filename, f.type); this.ledger.attachInvoice(t.id, { type: 'file', id: meta.id, name: meta.name }); extra = `\n📄 Saved ${esc(f.filename)}`; }
      catch (e) { extra = `\n⚠️ Linked the email but couldn't save its attachment: ${esc(e.message)}`; }
    }
    return this.refresh(mid, this.ledger.txn(t.id), extra);
  }

  async onMessage(m) {
    const text = (m.text || '').trim();
    const reply = m.reply_to_message && this.store.get('tg/' + m.reply_to_message.message_id);
    const t = reply && reply.txn ? this.ledger.txn(reply.txn) : null;
    if (m.document || m.photo) {
      if (!t) return this.tg.send('To attach a bill, reply to the transaction message with the photo or PDF.');
      const f = m.document ? { id: m.document.file_id, name: m.document.file_name || 'invoice', type: m.document.mime_type } : { id: m.photo[m.photo.length - 1].file_id, name: `photo-${t.date}.jpg`, type: 'image/jpeg' };
      try {
        const { buf } = await this.tg.download(f.id);
        const meta = this.files.save(buf, f.name, f.type);
        this.ledger.attachInvoice(t.id, { type: 'file', id: meta.id, name: meta.name });
        await this.refresh(m.reply_to_message.message_id, this.ledger.txn(t.id));
        return this.tg.send(`📎 Attached to ${money(t)} ${esc(t.party || '')}`);
      } catch (e) { return this.tg.send('Could not attach: ' + esc(e.message)); }
    }
    if (t && text && !text.startsWith('/')) {
      this.store.update('txns/' + t.id, { note: text.slice(0, 300), updated: Date.now() });
      await this.refresh(m.reply_to_message.message_id, this.ledger.txn(t.id));
      return this.tg.send('📝 Note saved.');
    }
    const cmd = text.split(/[\s@]/)[0].toLowerCase();
    if (cmd === '/todo') return this.sendTodo();
    if (cmd === '/summary') { const ist = new Date(Date.now() + 330 * 60000).toISOString(); return this.tg.send(this.summaryText(ist.slice(0, 7), `${MON[+ist.slice(5, 7) - 1]} ${ist.slice(0, 4)} so far`)); }
    if (cmd === '/sync') {
      await this.tg.send('🔄 Checking Gmail…');
      try { const r = await this.syncer.run(); await this.notifySync(r); return this.tg.send(r.created.length ? `Done: ${r.created.length} new.` : 'Done: nothing new.'); }
      catch (e) { return this.tg.send('Sync failed: ' + esc(e.message)); }
    }
    return this.tg.send([
      '<b>Books</b> sends each new CodeCrust and AITA bank transaction here.',
      'Tap a button to say what it is. Reply to a transaction with a photo or PDF to attach the bill, or with text to add a note.',
      '', '/todo: what is waiting', '/summary: this month so far', '/sync: check Gmail now',
      this.cfg.dashboardUrl ? `\nDashboard: ${esc(this.cfg.dashboardUrl)}` : '',
    ].join('\n'));
  }
}

module.exports = { Bot };
