// Bank alert + statement parsing for the Books ledger.
// Pure functions only: no DOM, no network. Shared by the artifact page
// (inlined at build time) and the Node tests.
(function (root) {
  'use strict';

  const IST_OFFSET_MS = 330 * 60 * 1000;

  // "5,000.00" -> 500000 (integer paise). Returns null for non-numbers.
  function toPaise(s) {
    if (s == null) return null;
    if (typeof s === 'number') return Number.isFinite(s) ? Math.round(s * 100) : null;
    const clean = String(s).replace(/[,\s₹]/g, '').replace(/^(INR|Rs\.?)/i, '');
    if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
    return Math.round(parseFloat(clean) * 100);
  }

  function fmtINR(paise) {
    const neg = paise < 0;
    const v = Math.abs(paise) / 100;
    const s = v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '-' : '') + '₹' + s;
  }

  // Epoch ms -> 'YYYY-MM-DD' in India time.
  function istDate(ms) {
    return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
  }

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  function pad2(n) { return String(n).padStart(2, '0'); }

  function validYMD(y, m, d) {
    if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // Indian bank date formats, always day-first:
  // 26-10-26, 26/10/2026, 26-Oct-2026, 26 Oct 26, 2026-10-26, Excel serials.
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return validYMD(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) { // Excel serial (1900 system)
        const ms = Math.round((v - 25569) * 86400000);
        return new Date(ms).toISOString().slice(0, 10);
      }
      return null;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return validYMD(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return validYMD(y, +m[2], +m[1]);
    }
    m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{2}|\d{4})\b/);
    if (m && MONTHS[m[2].toLowerCase()]) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return validYMD(y, MONTHS[m[2].toLowerCase()], +m[1]);
    }
    return null;
  }

  function htmlToText(html) {
    if (!html) return '';
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function squash(s) {
    return String(s || '').replace(/[​-‏﻿͏]/g, '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Pull UPI / NEFT / IMPS details out of a bank narration string.
  function parseNarration(narr) {
    const n = squash(narr);
    let m = n.match(/^UPI\/(\d{9,})\/(DR|CR)\/([^/]*)\/([^/]*)\/([^/\s]+)/i);
    if (m) return { mode: 'UPI', ref: m[1], party: m[3].trim(), vpa: m[5].trim() };
    m = n.match(/^UPI[-/]([^-/]+)[-/]([^-/]+@[^-/]+)[-/][^-/]*[-/](\d{9,})/i); // HDFC statement style
    if (m) return { mode: 'UPI', ref: m[3], party: m[1].trim(), vpa: m[2].trim() };
    m = n.match(/^(?:NEFT|N)[-/]([A-Z0-9]{8,})[-/](?:[A-Z]{4}0[A-Z0-9]{6}[-/])?([^/]*)/i);
    if (m) return { mode: 'NEFT', ref: m[1], party: m[2].trim(), vpa: null };
    m = n.match(/^(?:RTGS|R)[-/]([A-Z0-9]{8,})[-/](?:[A-Z]{4}0[A-Z0-9]{6}[-/])?([^/]*)/i);
    if (m) return { mode: 'RTGS', ref: m[1], party: m[2].trim(), vpa: null };
    m = n.match(/^IMPS[-/](\d{9,})[-/]([^-/]*)/i);
    if (m) return { mode: 'IMPS', ref: m[1], party: m[2].trim(), vpa: null };
    m = n.match(/\b(\d{12})\b/); // bare UPI ref somewhere in the text
    return { mode: null, ref: m ? m[1] : null, party: null, vpa: null };
  }

  // ---------- Alert email parsers ----------
  // Each returns a partial txn or null. `t` is the squashed email text.

  const AMT = '([\\d,]+(?:\\.\\d+)?)';

  const ALERT_PARSERS = [
    {
      // "Rs.410.00 is debited from your account ending 1366 towards VPA ****payu@hdfcbank (Blinkit) on 26-10-26. UPI transaction reference no.: 131900671465."
      id: 'hdfc-upi-debit',
      re: new RegExp('Rs\\.?\\s*' + AMT + '\\s+(?:is|has been)\\s+debited\\s+from\\s+your\\s+account\\s+ending(?:\\s+(?:in|with))?\\s+(\\d{4})\\s+towards\\s+(.+?)\\s+on\\s+(\\d{1,2}-\\d{1,2}-\\d{2,4})\\.?\\s+UPI\\s+transaction\\s+reference\\s+(?:no\\.?|number)\\s*:?\\s*(\\d+)', 'i'),
      build(m) {
        const tw = m[3].match(/^VPA\s+(\S+)\s*(?:\((.*)\))?/i);
        return {
          bank: 'hdfc', last4: m[2], dir: 'out', paise: toPaise(m[1]), date: parseDate(m[4]),
          mode: 'UPI', ref: m[5], vpa: tw ? tw[1] : null, party: tw ? (tw[2] || '').trim() || tw[1] : m[3],
        };
      },
    },
    {
      // Older HDFC wording: "Rs. 500.00 has been debited from account **1366 to VPA abc@ybl NAME on 01-06-26. Your UPI transaction reference number is 123."
      id: 'hdfc-upi-debit-v1',
      re: new RegExp('Rs\\.?\\s*' + AMT + '\\s+has\\s+been\\s+debited\\s+from\\s+account\\s+\\*+(\\d{4})\\s+to\\s+VPA\\s+(\\S+)\\s+(.*?)\\s+on\\s+(\\d{1,2}-\\d{1,2}-\\d{2,4})\\.\\s+Your\\s+UPI\\s+transaction\\s+reference\\s+number\\s+is\\s+(\\d+)', 'i'),
      build(m) {
        return { bank: 'hdfc', last4: m[2], dir: 'out', paise: toPaise(m[1]), date: parseDate(m[5]), mode: 'UPI', ref: m[6], vpa: m[3], party: m[4] || m[3] };
      },
    },
    {
      // "Rs.5000.00 has been successfully credited to your HDFC Bank account ending in 1366. Transaction Details: a. Date: 15-10-26 b. Sender: NAME (VPA: ****@okaxis) c. UPI Reference No.: 628844709431"
      id: 'hdfc-credit',
      re: new RegExp('Rs\\.?\\s*' + AMT + '\\s+has\\s+been\\s+(?:successfully\\s+)?credited\\s+to\\s+your\\s+HDFC\\s+Bank\\s+account\\s+ending(?:\\s+(?:in|with))?\\s+(\\d{4})', 'i'),
      build(m, t) {
        const date = (t.match(/Date:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i) || [])[1];
        const sender = t.match(/Sender:\s*(.+?)\s*(?:\(VPA:\s*([^)]+)\))?\s+(?:[a-z]\.\s+)?(?:UPI\s+)?Reference/i);
        const ref = (t.match(/Reference\s+(?:No\.?|Number)\s*:?\s*([A-Za-z0-9]+)/i) || [])[1] || null;
        return {
          bank: 'hdfc', last4: m[2], dir: 'in', paise: toPaise(m[1]), date: parseDate(date),
          mode: /UPI\s+Reference/i.test(t) ? 'UPI' : null, ref,
          party: sender ? sender[1].trim() : null, vpa: sender && sender[2] ? sender[2].trim() : null,
        };
      },
    },
    {
      // Older HDFC wording: "Rs. 500.00 is successfully credited to your account **1366 by VPA abc@ybl NAME on 01-06-26. Your UPI transaction reference number is 123."
      id: 'hdfc-upi-credit-v1',
      re: new RegExp('Rs\\.?\\s*' + AMT + '\\s+is\\s+successfully\\s+credited\\s+to\\s+your\\s+account\\s+\\*+(\\d{4})\\s+by\\s+VPA\\s+(\\S+)\\s+(.*?)\\s+on\\s+(\\d{1,2}-\\d{1,2}-\\d{2,4})\\.\\s+Your\\s+UPI\\s+transaction\\s+reference\\s+number\\s+is\\s+(\\d+)', 'i'),
      build(m) {
        return { bank: 'hdfc', last4: m[2], dir: 'in', paise: toPaise(m[1]), date: parseDate(m[5]), mode: 'UPI', ref: m[6], vpa: m[3], party: m[4] || m[3] };
      },
    },
    {
      // "Your IndusInd Bank Account No. 20XXXXXX9477 has been Debited for INR 5,000.00 towards UPI/628844709431/DR/CODE/HDFC/gdev@okhdfcbank . The balance available in your Account is INR 59,560.88."
      // Older: "Your IndusInd Account XXXXXXXX9477 has been credited for INR 7885.56 towards N/CITIN.../CITI0100000/GLOBAL REMITTANCE-O. Call ..."
      id: 'indusind-account',
      re: new RegExp('IndusInd(?:\\s+Bank)?\\s+Account(?:\\s+No\\.?)?\\s+\\w*?(\\d{4})\\s+has\\s+been\\s+(debited|credited)\\s+for\\s+INR\\s*' + AMT + '\\s+towards\\s+(.+?)\\s*\\.?\\s*(?=The\\s|Call\\s|$)', 'i'),
      build(m, t) {
        const bal = (t.match(new RegExp('balance\\s+available\\s+in\\s+your\\s+Account\\s+is\\s+INR\\s*' + AMT, 'i')) || [])[1];
        const narr = m[4].replace(/\s*\.$/, '').trim();
        const n = parseNarration(narr);
        return {
          bank: 'indusind', last4: m[1], dir: /debit/i.test(m[2]) ? 'out' : 'in', paise: toPaise(m[3]), date: null,
          mode: n.mode, ref: n.ref, party: n.party, vpa: n.vpa, narr, balPaise: bal ? toPaise(bal) : null,
        };
      },
    },
  ];

  // Last-resort matcher so an unfamiliar wording is surfaced instead of dropped.
  const GENERIC = new RegExp('(?:Rs\\.?|INR)\\s*' + AMT + '[^.]{0,80}?\\b(debited|credited)\\b[^.]{0,80}?(?:ending(?:\\s+(?:in|with))?|No\\.?|\\*{2,}|X{4,})\\s*\\w*?(\\d{4})\\b', 'i');

  // email: {id, from, subject, date (ISO string or ms), body, html, snippet, url}
  function parseAlert(email) {
    const text = squash([email.body, htmlToText(email.html), email.snippet].filter(Boolean).join(' '));
    if (!text) return null;
    const ms = typeof email.date === 'number' ? email.date : Date.parse(email.date);
    let out = null;
    for (const p of ALERT_PARSERS) {
      const m = text.match(p.re);
      if (m) { out = p.build(m, text); out.parser = p.id; break; }
    }
    if (!out) {
      const m = text.match(GENERIC);
      if (!m) return null;
      const bank = /hdfc/i.test(email.from || '') ? 'hdfc' : /indusind/i.test(email.from || '') ? 'indusind' : 'other';
      out = { bank, last4: m[3], dir: /debit/i.test(m[2]) ? 'out' : 'in', paise: toPaise(m[1]), date: null, parser: 'generic' };
    }
    if (!out.paise || !out.last4) return null;
    out.date = out.date || (Number.isFinite(ms) ? istDate(ms) : null);
    out.ts = Number.isFinite(ms) ? ms : null;
    out.narr = out.narr || squash(text.match(/(?:debited|credited)[\s\S]{0,220}/i)?.[0] || text.slice(0, 220));
    out.balPaise = out.balPaise == null ? null : out.balPaise;
    out.party = cleanParty(out.party);
    out.mail = email.id ? { id: email.id, url: email.url || null, subject: email.subject || '' } : null;
    return out;
  }

  function cleanParty(p) {
    if (!p) return null;
    const s = String(p).replace(/\s+/g, ' ').trim();
    return s || null;
  }

  function acctId(t) { return `${t.bank}-${t.last4}`; }

  function simpleHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  // Stable document id. Same bank txn seen twice (IndusInd sends two alert
  // formats for one credit; statement + alert) must land on the same id.
  function txnId(t) {
    const base = `${acctId(t)}-${t.dir}-${t.paise}`;
    if (t.ref) return `${base}-${String(t.ref).replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`;
    return `${base}-${t.date}-${simpleHash(squash(t.narr || '').toLowerCase())}`;
  }

  // Key used for "always label this payee as ..." rules.
  function partyKey(t) {
    const v = (t.vpa || '').toLowerCase().replace(/^\*+/, '');
    if (v && v.includes('@') && v.split('@')[0].length >= 3) return 'vpa:' + v;
    const p = (t.party || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return p ? 'name:' + p : null;
  }

  // Running-balance check for accounts whose alerts carry a balance.
  // Returns [{after, before, missingPaise}] where the chain breaks.
  function balanceGaps(txns) {
    const withBal = txns.filter(t => t.balPaise != null && t.ts != null).sort((a, b) => a.ts - b.ts);
    const gaps = [];
    for (let i = 1; i < withBal.length; i++) {
      const prev = withBal[i - 1], cur = withBal[i];
      const expected = prev.balPaise + (cur.dir === 'in' ? cur.paise : -cur.paise);
      if (expected !== cur.balPaise) {
        gaps.push({ after: prev.id || null, before: cur.id || null, from: prev.date, to: cur.date, missingPaise: cur.balPaise - expected });
      }
    }
    return gaps;
  }

  // ---------- Statement import ----------

  const HEAD = {
    date: /^(txn\.?\s*|transaction\s*|tran\s*|value\s*|posting\s*)?date$|^date$/i,
    narr: /narration|description|particulars|remarks|details/i,
    ref: /(chq|cheque|ref)/i,
    debit: /withdrawal|debit|dr\b|paid\s*out/i,
    credit: /deposit|credit|cr\b|paid\s*in/i,
    amount: /^amount|^txn\s*amount|transaction\s*amount/i,
    drcr: /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type)$/i,
    balance: /balance/i,
  };

  // Find the header row and guess which column is which.
  function detectColumns(rows) {
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const cells = (rows[r] || []).map(c => squash(c));
      const has = re => cells.findIndex(c => re.test(c));
      const dateCol = cells.findIndex(c => /date/i.test(c) && !/value/i.test(c));
      const narr = has(HEAD.narr);
      if (dateCol < 0 || narr < 0) continue;
      const map = { headerRow: r, date: dateCol, narr, ref: -1, debit: -1, credit: -1, amount: -1, drcr: -1, balance: -1 };
      cells.forEach((c, i) => {
        if (i === dateCol || i === narr) return;
        if (map.balance < 0 && HEAD.balance.test(c)) map.balance = i;
        else if (map.drcr < 0 && HEAD.drcr.test(c)) map.drcr = i;
        else if (map.debit < 0 && HEAD.debit.test(c) && !HEAD.balance.test(c)) map.debit = i;
        else if (map.credit < 0 && HEAD.credit.test(c) && !HEAD.balance.test(c)) map.credit = i;
        else if (map.amount < 0 && HEAD.amount.test(c)) map.amount = i;
        else if (map.ref < 0 && HEAD.ref.test(c)) map.ref = i;
      });
      return map;
    }
    return null;
  }

  function statementRows(rows, map) {
    const out = [];
    for (let r = map.headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const date = parseDate(row[map.date]);
      if (!date) continue;
      let dr = map.debit >= 0 ? toPaise(row[map.debit]) : null;
      let cr = map.credit >= 0 ? toPaise(row[map.credit]) : null;
      if (map.amount >= 0 && dr == null && cr == null) {
        const a = toPaise(row[map.amount]);
        const flag = map.drcr >= 0 ? String(row[map.drcr] || '') : '';
        if (a != null) { if (/^d/i.test(flag.trim()) || a < 0) dr = Math.abs(a); else cr = Math.abs(a); }
      }
      const paise = dr ? dr : cr;
      if (!paise) continue;
      const narr = squash(row[map.narr]);
      const n = parseNarration(narr);
      const refCell = map.ref >= 0 ? squash(row[map.ref]).replace(/^0+(?=\d)/, '') : '';
      out.push({
        date, narr, dir: dr ? 'out' : 'in', paise,
        balPaise: map.balance >= 0 ? toPaise(row[map.balance]) : null,
        ref: n.ref || (refCell && refCell.length >= 6 ? refCell : null),
        mode: n.mode, party: cleanParty(n.party), vpa: n.vpa,
      });
    }
    return out;
  }

  function dayDiff(a, b) { return Math.abs((Date.parse(a) - Date.parse(b)) / 86400000); }

  // Pair statement rows with known txns (same direction and amount, ref match
  // preferred, else nearest date within 3 days). Each txn is used once.
  function matchStatement(stmtRows, txns) {
    const free = new Set(txns.map((_, i) => i));
    const pairs = [];
    const unmatchedRows = [];
    stmtRows.forEach((row, ri) => {
      let best = -1, bestScore = Infinity;
      for (const ti of free) {
        const t = txns[ti];
        if (t.dir !== row.dir || t.paise !== row.paise) continue;
        const refHit = t.ref && (row.ref === String(t.ref) || row.narr.includes(String(t.ref)));
        const dd = dayDiff(t.date, row.date);
        if (!refHit && dd > 3) continue;
        const score = refHit ? -1 : dd;
        if (score < bestScore) { bestScore = score; best = ti; }
      }
      if (best >= 0) { free.delete(best); pairs.push([ri, best]); } else unmatchedRows.push(ri);
    });
    return { pairs, unmatchedRows, unmatchedTxns: [...free] };
  }

  // Opening/closing implied by a statement's running balance column.
  function statementTotals(rows) {
    let inP = 0, outP = 0;
    rows.forEach(r => { if (r.dir === 'in') inP += r.paise; else outP += r.paise; });
    const first = rows.find(r => r.balPaise != null);
    const last = [...rows].reverse().find(r => r.balPaise != null);
    const opening = first ? first.balPaise - (first.dir === 'in' ? first.paise : -first.paise) : null;
    const closing = last ? last.balPaise : null;
    const balanced = opening != null && closing != null ? opening + inP - outP === closing : null;
    const from = rows.reduce((m, r) => (!m || r.date < m ? r.date : m), null);
    const to = rows.reduce((m, r) => (!m || r.date > m ? r.date : m), null);
    return { inPaise: inP, outPaise: outP, opening, closing, balanced, from, to };
  }

  // Gmail query for invoices/bills around a payment.
  function invoiceQuery(t, mode) {
    const d = Date.parse(t.date);
    const fmt = ms => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '/');
    const after = fmt(d - 7 * 86400000), before = fmt(d + 4 * 86400000);
    const rupees = (t.paise / 100);
    const amt = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
    const words = '(invoice OR receipt OR bill OR "order confirmation" OR "payment successful" OR "tax invoice")';
    if (t.dir === 'in' && t.cat === 'Export revenue (foreign)' && mode !== 'party') return `(from:inward.remittances OR FIRC OR "inward remittance") after:${after} before:${before}`;
    if (mode === 'party' && t.party) {
      const name = t.party.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).slice(0, 3).join(' ');
      return `${words} ${name} after:${after} before:${before}`;
    }
    return `${words} ${amt} after:${after} before:${before}`;
  }

  const api = {
    toPaise, fmtINR, istDate, parseDate, htmlToText, squash, parseNarration, parseAlert,
    acctId, txnId, partyKey, balanceGaps, detectColumns, statementRows, matchStatement,
    statementTotals, invoiceQuery,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BankParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
