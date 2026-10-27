// One sync: new alert emails -> parsed transactions -> ledger, plus AI category suggestions.
const P = require('../src/parser.js');
const { DEFAULT_SINCE } = require('./ledger.js');

const looksLikeTxn = m => {
  const t = [m.subject, m.body, P.htmlToText(m.html)].join(' ');
  return /\b(debited|credited)\b/i.test(t) && /(Rs\.?|INR|₹)\s*[\d,]+/i.test(t);
};

class Syncer {
  constructor({ store, ledger, gmail, llm, log = console }) { Object.assign(this, { store, ledger, gmail, llm, log }); this.running = null; }

  run(opts = {}) {
    if (!this.running) this.running = this._run(opts).finally(() => { this.running = null; });
    return this.running;
  }

  async _run({ full = false } = {}) {
    if (!this.gmail || !this.gmail.configured()) throw new Error('Gmail is not set up. Run npm run setup.');
    const settings = this.store.get('meta/settings') || {};
    const state = this.store.get('meta/sync') || {};
    const since = full || !state.lastMailMs ? (settings.since || DEFAULT_SINCE) : P.istDate(state.lastMailMs - 3 * 86400000);
    const seen = new Set(full ? [] : ((this.store.get('meta/seen') || {}).ids || []));
    for (const t of this.ledger.txns()) for (const m of t.mails || []) seen.add(m.id);

    const mails = await this.gmail.fetchAlerts(since, seen);
    const parsed = []; let maxMs = state.lastMailMs || 0, aiRead = 0, unreadable = 0;
    for (const m of mails) {
      let t = P.parseAlert(m);
      if (!t && this.llm && this.llm.enabled() && looksLikeTxn(m)) {
        try { t = await this.llm.parseAlert(m); if (t) aiRead++; } catch (e) { this.log.warn('AI could not read alert', m.id, e.message); }
        if (!t) unreadable++;
      }
      if (t) parsed.push(t);
      const ms = Date.parse(m.date); if (ms > maxMs) maxMs = ms;
    }
    const res = this.ledger.ingest(parsed);

    let suggested = 0;
    if (this.llm && this.llm.enabled()) {
      for (const t of res.created) {
        if (t.status !== 'todo' || t.kind || !this.ledger.tracked(t)) continue;
        try {
          const s = await this.llm.suggestCategory(t, this.ledger.catsOut(), this.ledger.catsIn());
          this.store.update('txns/' + t.id, { suggest: s }); suggested++;
        } catch (e) { this.log.warn('no AI suggestion for', t.id, e.message); }
      }
    }
    const ids = [...new Set(((this.store.get('meta/seen') || {}).ids || []).concat(mails.map(m => m.id)))].slice(-4000);
    this.store.set('meta/seen', { ids });
    const summary = { lastRun: Date.now(), lastMailMs: maxMs || null, lastFound: mails.length, lastNew: res.created.length, aiRead, unreadable, suggested };
    this.store.set('meta/sync', summary);
    return { ...summary, created: res.created.map(t => this.ledger.txn(t.id)), newAccounts: res.newAccounts, merged: res.merged, ignored: res.ignored };
  }
}

module.exports = { Syncer, looksLikeTxn };
