// Local app: store, ledger, AI answer checks, PDF balance chain, Telegram flow.
// Telegram, Gmail and OpenRouter are faked; amounts and names are made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../src/parser.js');
const { Store, deepMerge } = require('../local/store.js');
const { Ledger } = require('../local/ledger.js');
const { LLM, redact } = require('../local/llm.js');
const { normalise, chainBreaks } = require('../local/pdf.js');
const { Bot } = require('../local/bot.js');
const { Files } = require('../local/files.js');
const { Syncer } = require('../local/sync.js');

const HDFC = 'alerts@hdfcbank.bank.in', IIB = 'indusind_bank@indusind.com';
const MAILS = [
  { id: 'a1', uid: 1, from: HDFC, date: '2026-10-26T13:57:00Z', subject: 'UPI txn', body: 'Dear Customer, Rs.410.00 is debited from your account ending 1234 towards VPA ****payu@hdfcbank (Grocer Co) on 26-10-26. UPI transaction reference no.: 111122223333. If you' },
  { id: 'a2', uid: 2, from: HDFC, date: '2026-10-15T17:19:41Z', subject: 'Account update', body: "Rs.5000.00 has been successfully credited to your HDFC Bank account ending in 1234. Transaction Details: a. Date: 15-10-26 b. Sender: ACME TECHNOLOGIES PRIVATE LIMITED (VPA: ****ev-2@okaxis) c. UPI Reference No.: 444455556666 Need Help?" },
  { id: 'a3', uid: 3, from: IIB, date: '2026-10-15T21:22:05Z', subject: 'IndusInd Bank Transaction Alert', body: 'Your IndusInd Bank Account No. 20XXXXXX5678 has been Debited for INR 5,000.00 towards UPI/444455556666/DR/CODE/HDFC/gdev@okhdfcbank . The balance available in your Account is INR 59,560.88.' },
  { id: 'a4', uid: 4, from: HDFC, date: '2026-10-20T10:00:00Z', subject: 'Txn', body: 'Dear Customer, your a/c XX1234 was debited by Rs 999.00 on 20-10-26 for NACH mandate ABC SOFTWARE.' },
];

function setup() {
  const store = new Store(':memory:');
  const ledger = new Ledger(store);
  store.set('accounts/hdfc-1234', { id: 'hdfc-1234', bank: 'hdfc', last4: '1234', entity: 'codecrust' });
  store.set('accounts/indusind-5678', { id: 'indusind-5678', bank: 'indusind', last4: '5678', entity: 'aita' });
  return { store, ledger };
}

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, opts) => { calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null }); const r = await handler(url, calls[calls.length - 1].body); return { ok: true, status: 200, json: async () => r, text: async () => JSON.stringify(r) }; };
  f.calls = calls; return f;
}
const orReply = obj => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

test('store: set/update/list/where/order and change events', () => {
  const s = new Store(':memory:'); const seen = [];
  s.on('change', c => seen.push(c.path));
  s.set('txns/a', { date: '2026-10-02', n: 1, inv: { state: 'missing', items: [1] } });
  s.set('txns/b', { date: '2026-10-05', n: 2 });
  s.update('txns/a', { inv: { items: [] }, x: true });
  assert.deepEqual(s.get('txns/a'), { date: '2026-10-02', n: 1, inv: { state: 'missing', items: [] }, x: true });
  assert.deepEqual(s.list('txns', { orderBy: 'date', dir: 'desc' }).map(r => r.id), ['b', 'a']);
  assert.deepEqual(s.list('txns', { where: [['n', '==', 2]] }).map(r => r.id), ['b']);
  assert.throws(() => s.update('txns/zz', {}), /no document/);
  assert.throws(() => s.set('bad path/x', {}), /bad document path/);
  s.delete('txns/b');
  assert.equal(s.get('txns/b'), undefined);
  assert.deepEqual(seen, ['txns/a', 'txns/b', 'txns/a', 'txns/b']);
  assert.deepEqual(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } }), { a: { b: 1, c: 3 } });
});

test('ledger: ingest, dedupe, inter-company pair, label with rule', () => {
  const { store, ledger } = setup();
  const parsed = MAILS.slice(0, 3).map(m => P.parseAlert(m));
  const r = ledger.ingest(parsed);
  assert.equal(r.created.length, 3);
  assert.equal(ledger.ingest(parsed).created.length, 0, 'second ingest creates nothing');
  const pair = ledger.txns().filter(t => t.pairId);
  assert.deepEqual(pair.map(t => t.kind).sort(), ['intercompany', 'intercompany']);
  const g = ledger.txns().find(t => t.party === 'Grocer Co');
  ledger.label(g.id, { kind: 'business', cat: 'Office supplies & equipment', remember: true });
  assert.equal(ledger.txn(g.id).status, 'done');
  assert.ok(ledger.needsInvoice(ledger.txn(g.id)));
  // a new txn from the same payee is labelled by the rule
  const next = P.parseAlert({ ...MAILS[0], id: 'a9', body: MAILS[0].body.replace('410.00', '220.00').replace('111122223333', '999988887777') });
  const r2 = ledger.ingest([next]);
  assert.equal(r2.created[0].status, 'done');
  assert.equal(r2.created[0].auto, true);
  assert.deepEqual(ledger.counts(), { label: 2, invoice: 2, stmt: 0 });
  assert.throws(() => ledger.label(g.id, { kind: 'business' }), /category/);
});

test('llm: category suggestion is validated against the list and sends only payee/amount', async () => {
  const { store, ledger } = setup();
  const f = fakeFetch(() => orReply({ kind: 'business', category: 'Software & subscriptions', reason: 'SaaS vendor' }));
  const llm = new LLM({ key: 'k', model: 'm/x', dailyLimit: 5 }, store, f);
  const t = { dir: 'out', paise: 99900, party: 'ABC SOFTWARE', vpa: 'abc@icici', mode: 'UPI', ref: '123412341234', narr: 'secret narration 50200062411366' };
  const s = await llm.suggestCategory(t, ledger.catsOut(), ledger.catsIn());
  assert.deepEqual(s, { kind: 'business', cat: 'Software & subscriptions', why: 'SaaS vendor' });
  const sent = JSON.stringify(f.calls[0].body.messages);
  assert.ok(!sent.includes('50200062411366') && !sent.includes('123412341234'), 'no account numbers or refs sent');
  assert.equal(f.calls[0].body.response_format.type, 'json_schema');
  const bad = new LLM({ key: 'k', model: 'm', dailyLimit: 5 }, store, fakeFetch(() => orReply({ kind: 'business', category: 'Yachts', reason: '' })));
  await assert.rejects(bad.suggestCategory(t, ledger.catsOut(), ledger.catsIn()), /not in list/);
});

test('llm: unknown alert accepted only when amount and account digits are in the email', async () => {
  const { store } = setup();
  const good = new LLM({ key: 'k', model: 'm', dailyLimit: 10 }, store, fakeFetch(() => orReply({ is_transaction: true, account_last4: '1234', direction: 'out', amount: '999.00', date: '2026-10-20', reference: '', counterparty: 'ABC SOFTWARE', balance_after: '' })));
  const t = await good.parseAlert(MAILS[3]);
  assert.deepEqual([t.last4, t.dir, t.paise, t.date, t.parser, t.bank], ['1234', 'out', 99900, '2026-10-20', 'llm', 'hdfc']);
  assert.match(t.review, /check/);
  const invented = new LLM({ key: 'k', model: 'm', dailyLimit: 10 }, store, fakeFetch(() => orReply({ is_transaction: true, account_last4: '1234', direction: 'out', amount: '9990.00', date: '', reference: '', counterparty: '', balance_after: '' })));
  assert.equal(await invented.parseAlert(MAILS[3]), null);
  const wrongAcct = new LLM({ key: 'k', model: 'm', dailyLimit: 10 }, store, fakeFetch(() => orReply({ is_transaction: true, account_last4: '9999', direction: 'out', amount: '999.00', date: '', reference: '', counterparty: '', balance_after: '' })));
  assert.equal(await wrongAcct.parseAlert(MAILS[3]), null);
});

test('llm: daily limit stops calls', async () => {
  const { store } = setup();
  const llm = new LLM({ key: 'k', model: 'm', dailyLimit: 1 }, store, fakeFetch(() => orReply({ kind: 'personal', category: '', reason: '' })));
  await llm.suggestCategory({ dir: 'out', paise: 100, party: 'X' }, ['Other expense'], ['Other income']);
  await assert.rejects(llm.suggestCategory({ dir: 'out', paise: 100, party: 'X' }, ['Other expense'], ['Other income']), /daily AI limit/);
});

test('redact strips links and long account numbers but keeps UPI refs', () => {
  const r = redact('a/c 50200062411366 ref 111122223333 see https://x.example/y?z=1 me@gmail.com');
  assert.ok(!r.includes('50200062411366') && r.includes('XXXX1366'));
  assert.ok(r.includes('111122223333'));
  assert.ok(!r.includes('https://') && !r.includes('me@gmail.com'));
});

test('pdf rows: normalise and balance chain', () => {
  const rows = normalise([
    { date: '01/10/26', narration: 'UPI-GROCER-PAYU@HDFCBANK-HDFC0000001-111122223333-UPI', debit: '410.00', credit: '', balance: '9,590.00' },
    { date: '02/10/26', narration: 'NEFT CR CLIENT', debit: '', credit: '1,000.00', balance: '10,590.00' },
    { date: '03/10/26', narration: 'MISREAD ROW', debit: '100.00', credit: '', balance: '10,390.00' },
    { date: 'Opening Balance', narration: '', debit: '', credit: '', balance: '10,000.00' },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].ref, '111122223333');
  const b = chainBreaks(rows);
  assert.equal(b.length, 1);
  assert.equal(b[0].narr, 'MISREAD ROW');
});

function fakeTelegram() {
  let n = 100; const sent = [];
  return {
    chatId: '42', sent,
    send: async (text, kb) => { const m = { message_id: ++n, text, kb }; sent.push(m); return m; },
    edit: async (id, text, kb) => { sent.push({ edit: id, text, kb }); },
    answer: async () => {},
    download: async () => ({ buf: Buffer.from('%PDF-1.4 test'), path: 'x.pdf' }),
  };
}

test('telegram: new txn -> business -> category -> find invoice -> attach; reply with PDF; ignores strangers', async () => {
  const { store, ledger } = setup();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'books-'));
  const files = new Files(dir, store);
  const tg = fakeTelegram();
  const gmail = {
    configured: () => true,
    fetchAlerts: async () => MAILS.slice(0, 3),
    search: async () => [{ id: 'inv1', uid: 77, url: 'https://mail.example/inv1', subject: 'Your Grocer Co receipt', from: 'orders@grocer.example', date: '2026-10-26T13:00:00Z', snippet: 'Total Rs 410', parts: { files: [{ part: '2', filename: 'receipt.pdf', type: 'application/pdf', size: 2000 }] } }],
    attachment: async () => Buffer.from('%PDF-1.4 receipt'),
  };
  const llm = new LLM({ key: 'k', model: 'm', dailyLimit: 50 }, store, fakeFetch((url, body) => {
    const name = body.response_format.json_schema.name;
    if (name === 'category') return orReply({ kind: 'personal', category: '', reason: 'Grocery delivery' });
    if (name === 'invoice_rank') return orReply({ ranked: [{ index: 0, match: 'strong', reason: 'Same amount and day' }] });
    throw new Error('unexpected ' + name);
  }));
  const syncer = new Syncer({ store, ledger, gmail, llm, log: { warn() {} } });
  const bot = new Bot({ tg, store, ledger, gmail, llm, files, syncer, log: { warn() {} } });
  const res = await syncer.run();
  assert.equal(res.created.length, 3);
  assert.equal(res.suggested, 1, 'the paired inter-company txns get no suggestion');
  await bot.notifySync(res);
  const msg = tg.sent.find(m => m.text && m.text.includes('Grocer Co'));
  assert.ok(msg, 'grocer message sent');
  assert.match(msg.text, /Suggested: Personal/);
  assert.equal(msg.kb[0][0].callback_data, 's');
  const chat = { id: 42 };
  const tap = data => bot.handle({ callback_query: { id: 'q', data, message: { message_id: msg.message_id, chat } } });
  await tap('k|business');
  assert.match(tg.sent[tg.sent.length - 1].text, /Which category/);
  const cats = ledger.catsOut();
  await tap('c|' + cats.indexOf('Meals & entertainment'));
  const t = ledger.txns().find(x => x.party === 'Grocer Co');
  assert.equal(t.cat, 'Meals & entertainment');
  assert.match(tg.sent[tg.sent.length - 1].text, /Invoice needed/);
  await tap('f');
  assert.match(tg.sent[tg.sent.length - 1].text, /⭐ Your Grocer Co receipt/);
  await tap('a|0');
  const t2 = ledger.txn(t.id);
  assert.equal(t2.inv.state, 'attached');
  assert.deepEqual(t2.inv.items.map(i => i.type), ['gmail', 'file']);
  assert.ok(fs.existsSync(files.get(t2.inv.items[1].id).file));
  // reply with a document to another txn's message
  const other = tg.sent.find(m => m.text && m.text.includes('ACME'));
  await bot.handle({ message: { chat, reply_to_message: { message_id: other.message_id }, document: { file_id: 'F', file_name: 'inv.pdf', mime_type: 'application/pdf' } } });
  const acme = ledger.txns().find(x => x.party === 'ACME TECHNOLOGIES PRIVATE LIMITED');
  assert.equal(acme.inv.state, 'attached');
  // text reply = note
  await bot.handle({ message: { chat, reply_to_message: { message_id: msg.message_id }, text: 'Team lunch' } });
  assert.equal(ledger.txn(t.id).note, 'Team lunch');
  // a stranger's tap does nothing
  const before = tg.sent.length;
  await bot.handle({ callback_query: { id: 'q', data: 'n', message: { message_id: msg.message_id, chat: { id: 7 } } } });
  await bot.handle({ message: { chat: { id: 7 }, text: '/todo' } });
  assert.equal(tg.sent.length, before);
  // digest
  await bot.digest(new Date('2026-10-27T03:30:00Z'));
  assert.match(tg.sent[tg.sent.length - 1].text, /Yesterday, 26 Oct: 1 transaction/);
});
