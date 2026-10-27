// Fixtures copy the banks' wording exactly; names, amounts and references are made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/parser.js');

const HDFC_FROM = 'alerts@hdfcbank.bank.in';
const IIB_FROM = 'indusind_bank@indusind.com';

test('HDFC UPI debit', () => {
  const t = P.parseAlert({
    id: 'm1', from: HDFC_FROM, date: '2026-10-26T13:57:00Z',
    body: " HDFC BANK\n\n| |\n| Dear Customer, Greetings from HDFC Bank! Rs.410.00 is debited from your account ending 1234 towards VPA ********payu@hdfcbank (Grocer Co) on 26-10-26. UPI transaction reference no.: 111122223333. If you did not authorize this transaction, please report it immediately at: a. When in India",
  });
  assert.equal(t.parser, 'hdfc-upi-debit');
  assert.deepEqual([t.bank, t.last4, t.dir, t.paise, t.date, t.ref, t.vpa, t.party],
    ['hdfc', '1234', 'out', 41000, '2026-10-26', '111122223333', '********payu@hdfcbank', 'Grocer Co']);
  assert.equal(P.txnId(t), 'hdfc-1234-out-41000-111122223333');
  assert.equal(P.partyKey(t), 'vpa:payu@hdfcbank');
});

test('HDFC credit with sender', () => {
  const t = P.parseAlert({
    from: HDFC_FROM, date: '2026-10-15T17:19:41Z',
    body: "Dear Customer, Greetings from HDFC Bank! We're writing to inform you that Rs.5000.00 has been successfully credited to your HDFC Bank account ending in 1234. Transaction Details: a. Date: 15-10-26 b. Sender: ACME TECHNOLOGIES PRIVATE LIMITED (VPA: ************ev-2@okaxis) c. UPI Reference No.: 444455556666 Need Help? India (Toll-Free)",
  });
  assert.equal(t.parser, 'hdfc-credit');
  assert.deepEqual([t.dir, t.paise, t.date, t.ref, t.party, t.vpa, t.mode],
    ['in', 500000, '2026-10-15', '444455556666', 'ACME TECHNOLOGIES PRIVATE LIMITED', '************ev-2@okaxis', 'UPI']);
});

test('HDFC older wordings', () => {
  const d = P.parseAlert({ from: HDFC_FROM, date: '2026-06-01T05:00:00Z',
    body: 'Dear Customer, Rs.250.00 has been debited from account **1234 to VPA shop@ybl SHOP NAME on 01-06-26. Your UPI transaction reference number is 999988887777.' });
  assert.deepEqual([d.parser, d.dir, d.paise, d.vpa, d.party, d.ref], ['hdfc-upi-debit-v1', 'out', 25000, 'shop@ybl', 'SHOP NAME', '999988887777']);
  const c = P.parseAlert({ from: HDFC_FROM, date: '2026-06-01T05:00:00Z',
    body: 'Dear Customer, Rs. 1,200.50 is successfully credited to your account **1234 by VPA pay@okicici CLIENT X on 02-06-26. Your UPI transaction reference number is 123412341234.' });
  assert.deepEqual([c.parser, c.dir, c.paise, c.date, c.party], ['hdfc-upi-credit-v1', 'in', 120050, '2026-06-02', 'CLIENT X']);
});

test('IndusInd debit with balance, date from email time in IST', () => {
  const t = P.parseAlert({
    from: IIB_FROM, date: '2026-10-15T21:22:05Z',
    body: ' ﻿\n\nDear Customer, Thank you for banking with us. Your IndusInd Bank Account No. 20XXXXXX5678 has been Debited for INR 5,000.00 towards UPI/444455556666/DR/CODE/HDFC/gdev@okhdfcbank . The balance available in your Account is INR 59,560.88.\n\n For any further assistance',
  });
  assert.equal(t.parser, 'indusind-account');
  assert.deepEqual([t.bank, t.last4, t.dir, t.paise, t.balPaise, t.ref, t.vpa, t.party, t.date],
    ['indusind', '5678', 'out', 500000, 5956088, '444455556666', 'gdev@okhdfcbank', 'CODE', '2026-10-16']);
});

test('IndusInd snippet-only and the older NEFT format share one id', () => {
  const a = P.parseAlert({ from: IIB_FROM, date: '2026-07-07T20:45:10Z',
    body: 'ï»¿ IndusInd Bank Dear Customer, Your IndusInd Account XXXXXXXX5678 has been credited for INR 7885.56 towards N/CITIN26000000001/CITI0100000/GLOBAL REMITTANCE-O. Call 18602677777 to report issue-' });
  const b = P.parseAlert({ from: IIB_FROM, date: '2026-07-07T21:22:58Z', body: ' IndusInd Bank\n\n| |',
    snippet: 'IndusInd Bank Dear Customer, Thank you for banking with us. Your IndusInd Bank Account No. 20XXXXXX5678 has been Credited for INR 7885.56 towards N/CITIN26000000001/CITI0100000/GLOBAL REMITTANCE-O. The' });
  assert.equal(a.mode, 'NEFT');
  assert.equal(a.ref, 'CITIN26000000001');
  assert.equal(a.party, 'GLOBAL REMITTANCE-O');
  assert.equal(P.txnId(a), P.txnId(b));
});

test('non-transaction emails are ignored', () => {
  assert.equal(P.parseAlert({ from: HDFC_FROM, date: '2026-06-24T10:19:39Z',
    body: 'Dear Customer, As per your request through HDFC Bank Chat Banking on WhatApp, we have successfully taken your request for a new cheque book for your Account number ending with 1234 .' }), null);
  assert.equal(P.parseAlert({ from: IIB_FROM, date: '2026-10-23T13:52:47Z',
    body: 'Dear Customer, We will be performing scheduled maintenance activity for IndusInd Bank UPI systems' }), null);
});

test('balance chain finds a missing debit', () => {
  const gaps = P.balanceGaps([
    { id: 'a', ts: 1, date: '2026-07-01', dir: 'in', paise: 1000, balPaise: 10000 },
    { id: 'b', ts: 2, date: '2026-07-02', dir: 'out', paise: 500, balPaise: 9500 },
    { id: 'c', ts: 3, date: '2026-07-05', dir: 'out', paise: 500, balPaise: 8000 },
  ]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].missingPaise, -1000);
  assert.equal(gaps[0].before, 'c');
});

test('dates', () => {
  assert.equal(P.parseDate('26-10-26'), '2026-10-26');
  assert.equal(P.parseDate('05/07/2026'), '2026-07-05');
  assert.equal(P.parseDate('05-Jul-2026'), '2026-07-05');
  assert.equal(P.parseDate('05 Jul 26'), '2026-07-05');
  assert.equal(P.parseDate(46208), '2026-07-05');
  assert.equal(P.parseDate('31/02/2026'), null);
  assert.equal(P.parseDate('Opening Balance'), null);
});

test('statement import: detect, parse, total, match', () => {
  const rows = [
    ['ACME TECHNOLOGIES PRIVATE LIMITED'],
    ['Statement of account'],
    [],
    ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['01/10/26', 'UPI-GROCER CO-PAYU@HDFCBANK-HDFC0000001-111122223333-UPI', '0000111122223333', '01/10/26', '410.00', '', '9,590.00'],
    ['15/10/26', 'NEFT CR-CITI0100000-CLIENT LLC-INV 42', 'CITIN26000000002', '15/10/26', '', '50,000.00', '59,590.00'],
    ['20/10/26', 'CHRG: SMS ALERT CHARGES', '', '20/10/26', '17.70', '', '59,572.30'],
  ];
  const map = P.detectColumns(rows);
  assert.equal(map.headerRow, 3);
  assert.deepEqual([map.date, map.narr, map.ref, map.debit, map.credit, map.balance], [0, 1, 2, 4, 5, 6]);
  const st = P.statementRows(rows, map);
  assert.equal(st.length, 3);
  assert.deepEqual([st[0].dir, st[0].paise, st[0].ref, st[0].party], ['out', 41000, '111122223333', 'GROCER CO']);
  assert.deepEqual([st[1].dir, st[1].paise], ['in', 5000000]);
  const tot = P.statementTotals(st);
  assert.deepEqual([tot.opening, tot.closing, tot.balanced, tot.from, tot.to], [1000000, 5957230, true, '2026-10-01', '2026-10-20']);

  const txns = [
    { date: '2026-10-01', dir: 'out', paise: 41000, ref: '111122223333' },
    { date: '2026-10-14', dir: 'in', paise: 5000000, ref: null },
    { date: '2026-10-22', dir: 'out', paise: 99900, ref: '777766665555' },
  ];
  const m = P.matchStatement(st, txns);
  assert.deepEqual(m.pairs, [[0, 0], [1, 1]]);
  assert.deepEqual(m.unmatchedRows, [2]);
  assert.deepEqual(m.unmatchedTxns, [2]);
});

test('statement with single amount + Dr/Cr column', () => {
  const rows = [
    ['Txn Date', 'Description', 'Amount', 'Dr/Cr', 'Balance'],
    ['05-Oct-2026', 'IMPS/123456789012/VENDOR', '1,000.00', 'Dr', '4,000.00'],
    ['06-Oct-2026', 'UPI/444455556666/CR/ACME/INDB/x@okaxis/Pay', '250.00', 'Cr', '4,250.00'],
  ];
  const map = P.detectColumns(rows);
  const st = P.statementRows(rows, map);
  assert.deepEqual(st.map(r => [r.dir, r.paise, r.mode, r.ref]), [['out', 100000, 'IMPS', '123456789012'], ['in', 25000, 'UPI', '444455556666']]);
});

test('invoice queries', () => {
  const t = { date: '2026-10-26', paise: 41000, party: 'Grocer Co' };
  assert.equal(P.invoiceQuery(t), '(invoice OR receipt OR bill OR "order confirmation" OR "payment successful" OR "tax invoice") 410 after:2026/10/19 before:2026/10/30');
  assert.match(P.invoiceQuery(t, 'party'), / Grocer Co after:/);
});
