// OpenRouter for the few jobs fixed rules can't do. Every answer is checked before it is used,
// and nothing it returns is saved as final: the person confirms in Telegram or the page.
const P = require('../src/parser.js');
const { KINDS } = require('./ledger.js');

const URL = 'https://openrouter.ai/api/v1/chat/completions';

// Remove what a model never needs: links, long digit runs that could be account or card numbers.
function redact(text) {
  return P.squash(text)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b(\d{4})[\dX*]{6,}(\d{4})\b/gi, 'XXXX$2')
    .replace(/[\w.+-]+@(gmail|yahoo|outlook|hotmail)\.com/gi, '[email]');
}

function today() { return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); }

class LLM {
  constructor(cfg, store, fetchImpl = globalThis.fetch) { this.cfg = cfg; this.store = store; this.fetch = fetchImpl; }

  enabled() { return !!(this.cfg.key && this.cfg.model); }

  used() { const d = this.store.get(`llm/${today()}`); return d ? d.calls : 0; }

  async json(name, schema, system, user) {
    if (!this.enabled()) throw new Error('OpenRouter is not configured');
    if (this.used() >= this.cfg.dailyLimit) throw new Error(`daily AI limit of ${this.cfg.dailyLimit} calls reached`);
    const res = await this.fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.key}`, 'Content-Type': 'application/json', 'X-Title': 'Books' },
      body: JSON.stringify({
        model: this.cfg.model, temperature: 0,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }], // user: string, or content parts for images
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
      }),
    });
    const u = this.store.get(`llm/${today()}`) || { calls: 0 };
    this.store.set(`llm/${today()}`, { calls: u.calls + 1 });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const content = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    if (!content) throw new Error('OpenRouter returned no content');
    try { return JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch (_) { throw new Error('OpenRouter returned text that is not JSON'); }
  }

  // Category suggestion for a new payee. Sends payee name, direction and amount only.
  async suggestCategory(t, catsOut, catsIn) {
    const cats = t.dir === 'out' ? catsOut : catsIn;
    const payee = t.party || (t.vpa || '').replace(/^\*+/, '') || 'unknown';
    const schema = {
      type: 'object', additionalProperties: false, required: ['kind', 'category', 'reason'],
      properties: {
        kind: { type: 'string', enum: Object.keys(KINDS) },
        category: { type: 'string', enum: cats.concat(['']) },
        reason: { type: 'string' },
      },
    };
    const out = await this.json('category', schema,
      'You label bank transactions for two small Indian companies (CodeCrust, AITA Technologies). Choose the most likely type and, for business transactions, one category from the list. Use "personal" for groceries, food delivery and other household spending unless the payee is clearly a business supplier. Keep the reason under 12 words.',
      JSON.stringify({ payee, direction: t.dir === 'out' ? 'money out' : 'money in', amount_inr: t.paise / 100, mode: t.mode || null, categories: cats }));
    if (!KINDS[out.kind]) throw new Error('bad kind');
    if (out.kind === 'business' && !cats.includes(out.category)) throw new Error('category not in list');
    return { kind: out.kind, cat: out.kind === 'business' ? out.category : null, why: String(out.reason || '').slice(0, 120) };
  }

  // Alert email the fixed parsers did not recognise. The answer is accepted only when its
  // amount and account digits literally appear in the email.
  async parseAlert(email) {
    const text = redact([email.body, P.htmlToText(email.html), email.snippet].filter(Boolean).join(' ')).slice(0, 3000);
    const schema = {
      type: 'object', additionalProperties: false,
      required: ['is_transaction', 'account_last4', 'direction', 'amount', 'date', 'reference', 'counterparty', 'balance_after'],
      properties: {
        is_transaction: { type: 'boolean' },
        account_last4: { type: 'string' },
        direction: { type: 'string', enum: ['in', 'out'] },
        amount: { type: 'string' },
        date: { type: 'string' },
        reference: { type: 'string' },
        counterparty: { type: 'string' },
        balance_after: { type: 'string' },
      },
    };
    const o = await this.json('bank_alert', schema,
      'Extract the bank transaction from this Indian bank alert email. Copy numbers exactly as written. date as YYYY-MM-DD or empty. Use empty strings for anything not stated. If the email is not a completed debit or credit on a bank account (for example a promotion, an OTP, a declined card payment or a credit card alert), set is_transaction to false.',
      `From: ${email.from}\nSubject: ${email.subject}\n\n${text}`);
    if (!o.is_transaction) return null;
    const flat = text.replace(/,/g, '');
    const paise = P.toPaise(o.amount);
    if (!paise || !/^\d{4}$/.test(o.account_last4) || !text.includes(o.account_last4)) return null;
    if (!flat.includes(String(o.amount).replace(/,/g, '').replace(/\.00$/, ''))) return null;
    const ms = Date.parse(email.date);
    const bank = /hdfc/i.test(email.from) ? 'hdfc' : /indusind/i.test(email.from) ? 'indusind' : 'other';
    return {
      bank, last4: o.account_last4, dir: o.direction, paise, date: P.parseDate(o.date) || P.istDate(ms), ts: ms,
      ref: o.reference || null, party: o.counterparty || null, vpa: null, mode: null, narr: text.slice(0, 220),
      balPaise: o.balance_after ? P.toPaise(o.balance_after) : null, parser: 'llm', review: 'Read by AI: check the amount and account',
      mail: email.id ? { id: email.id, url: email.url || null, subject: email.subject || '' } : null,
    };
  }

  // One page of a PDF statement (text lines) -> rows. Checked afterwards by the balance chain.
  async statementRows(lines) {
    const schema = {
      type: 'object', additionalProperties: false, required: ['rows'],
      properties: { rows: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['date', 'narration', 'debit', 'credit', 'balance'],
        properties: { date: { type: 'string' }, narration: { type: 'string' }, debit: { type: 'string' }, credit: { type: 'string' }, balance: { type: 'string' } },
      } } },
    };
    const o = await this.json('statement_rows', schema,
      'These are text lines from one page of an Indian bank account statement, columns separated by " | ". Return every transaction row in order. Copy amounts exactly as printed, empty string when a column is blank. Use the transaction date (not value date) exactly as printed. Join narration text that wraps onto the next line. Skip headers, opening/closing balance lines, totals and footers.',
      lines.join('\n'));
    return o.rows || [];
  }

  // Read an invoice or bill: from PDF text, or from an image (needs a vision-capable model).
  async extractInvoice({ text, image, mime }) {
    const str = { type: 'string' };
    const schema = {
      type: 'object', additionalProperties: false,
      required: ['is_invoice', 'vendor', 'gstin', 'invoice_number', 'invoice_date', 'taxable_value', 'cgst', 'sgst', 'igst', 'total', 'currency'],
      properties: { is_invoice: { type: 'boolean' }, vendor: str, gstin: str, invoice_number: str, invoice_date: str, taxable_value: str, cgst: str, sgst: str, igst: str, total: str, currency: str },
    };
    const system = 'Extract the details of this invoice, bill or receipt issued to an Indian company. gstin is the SELLER\'s 15-character GSTIN (not the buyer\'s). Copy numbers exactly as printed, without currency symbols. invoice_date as YYYY-MM-DD. Use empty strings for anything not printed. currency as a 3-letter code (INR if rupees). If this is not an invoice, bill or receipt, set is_invoice to false.';
    const user = image
      ? [{ type: 'text', text: 'The invoice is in this image.' }, { type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } }]
      : String(text).slice(0, 12000);
    return this.json('invoice', schema, system, user);
  }

  // Rank candidate emails for a payment. Returns indexes, best first.
  async rankInvoices(t, candidates) {
    const schema = {
      type: 'object', additionalProperties: false, required: ['ranked'],
      properties: { ranked: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'match', 'reason'],
        properties: { index: { type: 'integer' }, match: { type: 'string', enum: ['strong', 'possible', 'no'] }, reason: { type: 'string' } } } } },
    };
    const o = await this.json('invoice_rank', schema,
      'Which of these emails is the invoice, bill or receipt for this payment? Judge by amount, date and payee. Return every candidate with match strong, possible or no, best first. Reason under 12 words.',
      JSON.stringify({ payment: { payee: t.party || t.vpa, amount_inr: t.paise / 100, date: t.date }, candidates: candidates.map((c, i) => ({ index: i, from: c.from, subject: c.subject, date: c.date, snippet: redact(c.snippet || '').slice(0, 300), attachments: (c.parts && c.parts.files || []).map(f => f.filename) })) }));
    return (o.ranked || []).filter(r => Number.isInteger(r.index) && r.index >= 0 && r.index < candidates.length && r.match !== 'no');
  }
}

module.exports = { LLM, redact };
