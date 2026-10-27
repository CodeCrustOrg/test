// Ledger rules shared by sync, Telegram and the API. Mirrors what the page does in the browser,
// so documents written here look exactly like ones the page writes.
const P = require('../src/parser.js');

const ENTITIES = { codecrust: 'CodeCrust', aita: 'AITA Technologies' };
const BANKS = { hdfc: 'HDFC', indusind: 'IndusInd', other: 'Bank' };
const CATS_OUT = ['Salaries & contractors', 'Software & subscriptions', 'Cloud & hosting', 'Rent & office', 'Internet & phone', 'Travel', 'Meals & entertainment', 'Office supplies & equipment', 'Professional fees (CA, legal)', 'Marketing & ads', 'Bank charges', 'GST paid', 'TDS / income tax', 'Loan repayment / EMI', 'Other expense'];
const CATS_IN = ['Client revenue (India)', 'Export revenue (foreign)', 'Interest income', 'Refund received', 'Capital introduced', 'Loan received', 'Other income'];
const KINDS = {
  business: { out: 'Business expense', in: 'Business income' },
  intercompany: { out: 'Inter-company', in: 'Inter-company' },
  transfer: { out: 'Own transfer', in: 'Own transfer' },
  personal: { out: 'Personal', in: 'Personal' },
};
const DEFAULT_SINCE = '2026-04-01';

const docId = s => String(s).replace(/[^A-Za-z0-9_.~:@+-]/g, '_').slice(0, 190);

class Ledger {
  constructor(store) { this.store = store; }

  settings() { return this.store.get('meta/settings') || {}; }
  catsOut() { const s = this.settings(); return s.catsOut && s.catsOut.length ? s.catsOut : CATS_OUT; }
  catsIn() { const s = this.settings(); return s.catsIn && s.catsIn.length ? s.catsIn : CATS_IN; }
  cats(dir) { return dir === 'out' ? this.catsOut() : this.catsIn(); }
  account(id) { return this.store.get('accounts/' + id); }
  entityOf(t) { const a = this.account(t.acct); return a ? a.entity : null; }
  tracked(t) { return !!ENTITIES[this.entityOf(t)]; }
  acctName(id) { const a = this.account(id); return a ? `${BANKS[a.bank] || a.bank} ••${a.last4}` : id; }
  txns(opts) { return this.store.values('txns', opts); }
  txn(id) { const t = this.store.get('txns/' + id); return t ? { ...t, id } : null; }

  newTxnDoc(t, id, a) {
    const doc = {
      id, acct: a ? a.id : P.acctId(t), bank: t.bank, last4: t.last4, dir: t.dir, paise: t.paise, date: t.date, ts: t.ts || null,
      mode: t.mode || null, ref: t.ref || null, party: t.party || null, vpa: t.vpa || null, narr: t.narr || null,
      balPaise: t.balPaise == null ? null : t.balPaise, parser: t.parser || null, mails: t.mail ? [t.mail] : [], src: { alert: !!t.mail },
      kind: null, cat: null, note: '', status: 'todo', inv: { state: 'missing', items: [] }, recon: null, created: Date.now(), updated: Date.now(),
    };
    if (t.review) doc.review = t.review;
    const key = P.partyKey(doc); const rule = key && this.store.get('rules/' + docId(key));
    if (rule && (!rule.dir || rule.dir === doc.dir)) {
      doc.kind = rule.kind; doc.cat = rule.cat || null; doc.status = 'done'; doc.auto = true;
      if (rule.kind !== 'business') doc.inv = { state: 'not_needed', items: [] };
    }
    return doc;
  }

  // Parsed alerts -> txn documents. Returns the newly created txns (for notifications).
  ingest(parsed) {
    const created = [], newAccounts = []; let merged = 0, ignored = 0;
    for (const t of parsed) {
      const aid = P.acctId(t);
      let a = this.account(aid);
      if (!a) { a = { id: aid, bank: t.bank, last4: t.last4, entity: null, firstSeen: Date.now() }; this.store.set('accounts/' + aid, a); newAccounts.push(a); }
      if (a.entity === 'ignore') { ignored++; continue; }
      const id = docId(P.txnId(t));
      const ex = this.txn(id);
      if (ex) {
        const mails = ex.mails || [];
        if (t.mail && !mails.some(x => x.id === t.mail.id)) {
          const patch = { mails: mails.concat([t.mail]).slice(-4), src: { ...ex.src, alert: true }, updated: Date.now() };
          if (ex.balPaise == null && t.balPaise != null) patch.balPaise = t.balPaise;
          if (!ex.ts && t.ts) patch.ts = t.ts;
          if (ex.recon === 'stmt_only') patch.recon = 'matched';
          this.store.update('txns/' + id, patch);
        }
        merged++;
      } else {
        const doc = this.newTxnDoc(t, id, a);
        this.store.set('txns/' + id, doc);
        created.push(doc);
      }
    }
    this.pairInterCompany();
    return { created: created.map(d => this.txn(d.id)), newAccounts, merged, ignored };
  }

  // Same reference leaving one tracked account and arriving in another.
  pairInterCompany() {
    const byRef = {};
    for (const t of this.txns()) if (t.ref && this.tracked(t)) (byRef[t.ref + ':' + t.paise] = byRef[t.ref + ':' + t.paise] || []).push(t);
    for (const list of Object.values(byRef)) {
      const o = list.find(t => t.dir === 'out'), i = list.find(t => t.dir === 'in');
      if (!o || !i || o.acct === i.acct) continue;
      const kind = this.entityOf(o) === this.entityOf(i) ? 'transfer' : 'intercompany';
      for (const [t, other] of [[o, i], [i, o]]) {
        if (t.pairId === other.id) continue;
        const patch = { pairId: other.id, updated: Date.now() };
        if (t.status === 'todo' && !t.kind) { patch.kind = kind; patch.inv = { state: 'not_needed', items: [] }; }
        this.store.update('txns/' + t.id, patch);
      }
    }
  }

  // Same effect as pressing Save on a card in the page.
  label(id, { kind, cat = null, note, remember = false }) {
    const t = this.txn(id);
    if (!t) throw new Error('no such transaction');
    if (!KINDS[kind]) throw new Error('unknown type');
    if (kind === 'business' && !cat) throw new Error('category needed');
    const patch = { kind, cat: kind === 'business' ? cat : null, status: 'done', auto: false, updated: Date.now() };
    if (note != null) patch.note = String(note).trim();
    if (kind !== 'business' && (!t.inv || t.inv.state === 'missing')) patch.inv = { state: 'not_needed', items: [] };
    if (kind === 'business' && t.dir === 'out' && t.inv && t.inv.state === 'not_needed' && !(t.inv.items || []).length && t.kind !== 'business') patch.inv = { state: 'missing', items: [] };
    this.store.update('txns/' + id, patch);
    const key = P.partyKey(t);
    if (remember && key) {
      const rid = docId(key);
      this.store.set('rules/' + rid, { id: rid, key, label: t.party || t.vpa, dir: t.dir, kind, cat: patch.cat, created: Date.now() });
      for (const o of this.txns({ where: [['status', '==', 'todo']] })) {
        if (o.id !== id && o.dir === t.dir && P.partyKey(o) === key) {
          this.store.update('txns/' + o.id, { kind, cat: patch.cat, status: 'done', auto: true, updated: Date.now(), ...(kind !== 'business' ? { inv: { state: 'not_needed', items: [] } } : {}) });
        }
      }
    }
    return this.txn(id);
  }

  attachInvoice(id, item) {
    const t = this.txn(id); if (!t) throw new Error('no such transaction');
    const items = (t.inv && t.inv.items || []).filter(i => !(i.type === item.type && i.id === item.id)).concat([item]);
    this.store.update('txns/' + id, { inv: { state: 'attached', items }, updated: Date.now() });
  }

  setInvoiceNotNeeded(id) { this.store.update('txns/' + id, { inv: { state: 'not_needed', items: [] }, updated: Date.now() }); }

  needsInvoice(t) { return t.status === 'done' && t.kind === 'business' && t.dir === 'out' && (!t.inv || t.inv.state === 'missing'); }

  counts() {
    let label = 0, invoice = 0, stmt = 0;
    for (const t of this.txns()) {
      if (!this.tracked(t)) continue;
      if (t.status === 'todo') label++; else if (this.needsInvoice(t)) invoice++;
      if (t.recon === 'missing_in_stmt') stmt++;
    }
    return { label, invoice, stmt };
  }

  // Totals per company for txns whose date starts with `prefix` ('2026-10' or '2026-10-26').
  totals(prefix) {
    const out = {};
    for (const k of Object.keys(ENTITIES)) out[k] = { in: 0, out: 0, n: 0 };
    for (const t of this.txns()) {
      const e = this.entityOf(t);
      if (!ENTITIES[e] || !(t.date || '').startsWith(prefix) || t.kind === 'transfer') continue;
      out[e][t.dir] += t.paise; out[e].n++;
    }
    return out;
  }
}

module.exports = { Ledger, ENTITIES, BANKS, CATS_OUT, CATS_IN, KINDS, DEFAULT_SINCE, docId };
