// CA pack: one ZIP per period with an Excel workbook per company and the invoice files.
// Sheets: Summary, Bank book, Expenses (purchase register with GST), Income, Inter-company & personal, To check.
const fs = require('fs');
const path = require('path');
const { xlsx, zip } = require('./xlsx.js');
const { ENTITIES, KINDS } = require('./ledger.js');
const { checkInvoice, gstinValid, STATES } = require('../src/gst.js');

const rupees = p => (p == null ? null : p / 100);
const money = v => ({ money: v });
const r2 = v => Math.round(v * 100) / 100;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dLong = d => (d ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '');
const safe = s => String(s || '').replace(/[^A-Za-z0-9 ._-]+/g, ' ').replace(/\s+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'unknown';
const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

// Period presets in India's financial year (Apr-Mar; quarters Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar).
function period(preset, today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const start = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  const end = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const shift = (yy, mm, k) => { const i = yy * 12 + (mm - 1) + k; return [Math.floor(i / 12), (i % 12) + 1]; };
  const fyOf = (yy, mm) => (mm >= 4 ? yy : yy - 1);
  const qLabel = (yy, mm) => `Q${((mm + 8) % 12) / 3 + 1} FY ${fyOf(yy, mm)}-${String(fyOf(yy, mm) + 1).slice(2)}`;
  const [qy, qm] = shift(y, m, -(((m + 8) % 12) % 3)); // first month of this quarter
  const fy = fyOf(y, m);
  switch (preset) {
    case 'this-month': return { from: start(y, m), to: today, label: `${MON[m - 1]} ${y} (so far)` };
    case 'last-month': { const [yy, mm] = shift(y, m, -1); return { from: start(yy, mm), to: end(yy, mm), label: `${MON[mm - 1]} ${yy}` }; }
    case 'this-quarter': return { from: start(qy, qm), to: today, label: qLabel(qy, qm) + ' (so far)' };
    case 'last-quarter': { const [sy, sm] = shift(qy, qm, -3); const [ey, em] = shift(sy, sm, 2); return { from: start(sy, sm), to: end(ey, em), label: qLabel(sy, sm) }; }
    case 'this-fy': return { from: `${fy}-04-01`, to: today, label: `FY ${fy}-${String(fy + 1).slice(2)} (so far)` };
    case 'last-fy': return { from: `${fy - 1}-04-01`, to: `${fy}-03-31`, label: `FY ${fy - 1}-${String(fy).slice(2)}` };
    default: throw new Error('unknown period');
  }
}

function companySheets({ ledger, store, files }, entity, from, to, fileList) {
  const settings = store.get('meta/settings') || {};
  const company = (settings.companies || {})[entity] || {};
  const accts = store.values('accounts').filter(a => a.entity === entity);
  const txns = ledger.txns().filter(t => accts.some(a => a.id === t.acct) && t.date >= from && t.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0)));
  const label = t => (t.status === 'todo' ? 'Not labelled' : t.kind === 'business' ? t.cat || 'Uncategorised' : KINDS[t.kind] ? KINDS[t.kind][t.dir] : '');
  const who = t => t.party || (t.vpa || '').replace(/^\*+/, '') || t.stmtNarr || t.narr || '';
  const issues = [];
  const used = new Set();

  // Invoice files -> Invoices/<company>/date_vendor_amount.ext
  const docNames = new Map();
  for (const t of txns) {
    const names = [];
    for (const it of (t.inv && t.inv.items) || []) {
      if (it.type !== 'file') continue;
      const f = files.get(it.id); if (!f || !fs.existsSync(f.file)) continue;
      let base = `${t.date}_${safe((t.gst && t.gst.vendor) || who(t))}_${Math.round(t.paise / 100)}`, name = base + path.extname(f.file), k = 2;
      while (used.has(name)) name = `${base}_${k++}${path.extname(f.file)}`;
      used.add(name);
      fileList.push({ name: `${ENTITIES[entity]}/Invoices/${name}`, data: fs.readFileSync(f.file) });
      names.push(`Invoices/${name}`);
    }
    docNames.set(t.id, names);
  }
  const links = t => ((t.inv && t.inv.items) || []).filter(i => i.type === 'gmail').map(i => i.url).filter(Boolean);

  // Bank book
  const bank = [['Date', 'Bank account', 'Paid to / received from', 'Money out', 'Money in', 'Balance', 'Type', 'Category', 'Note', 'Mode', 'Bank reference', 'Bank narration', 'Invoice / document', 'Statement check']];
  for (const t of txns) {
    const bal = t.stmtBal != null ? t.stmtBal : t.balPaise;
    bank.push([{ date: t.date }, ledger.acctName(t.acct), who(t), t.dir === 'out' ? money(rupees(t.paise)) : '', t.dir === 'in' ? money(rupees(t.paise)) : '', bal != null ? money(rupees(bal)) : '',
      t.status === 'todo' ? 'Not labelled' : KINDS[t.kind] ? KINDS[t.kind][t.dir] : '', t.kind === 'business' ? t.cat || '' : '', t.note || '', t.mode || '', t.ref || '',
      t.stmtNarr || t.narr || '', docNames.get(t.id).concat(links(t)).join(' | ') || (t.inv && t.inv.state === 'not_needed' ? 'Not needed' : ''),
      t.recon === 'matched' ? 'On statement' : t.recon === 'stmt_only' ? 'Statement only (no alert)' : t.recon === 'missing_in_stmt' ? 'NOT on statement' : 'Statement not imported']);
  }

  // Expenses (purchase register)
  const exp = [['Date paid', 'Vendor', 'Vendor GSTIN', 'Vendor state', 'Invoice no.', 'Invoice date', 'Category', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Invoice total', 'Amount paid', 'Difference', 'Invoice file', 'Invoice email', 'Note', 'Checks']];
  const byCat = {};
  for (const t of txns.filter(t => t.dir === 'out' && t.kind === 'business')) {
    const g = t.gst || null;
    const chk = g ? checkInvoice(g, t.paise, company.gstin) : { issues: [] };
    const notes = [].concat(chk.issues || [], (g && g.flags) || []);
    const c = byCat[t.cat || 'Uncategorised'] = byCat[t.cat || 'Uncategorised'] || { n: 0, paid: 0, taxable: 0, gst: 0, withInv: 0 };
    c.n++; c.paid += rupees(t.paise);
    if (g) { c.taxable += g.taxable || 0; c.gst += chk.tax || 0; }
    const hasInv = t.inv && t.inv.state === 'attached';
    if (hasInv) c.withInv++;
    exp.push([{ date: t.date }, (g && g.vendor) || who(t), g ? g.gstin || '' : '', g && g.gstin ? STATES[g.gstin.slice(0, 2)] || '' : '', g ? g.invNo || '' : '', g && g.invDate ? { date: g.invDate } : '', t.cat || '',
      g && g.taxable != null ? money(g.taxable) : '', g && g.cgst ? money(g.cgst) : '', g && g.sgst ? money(g.sgst) : '', g && g.igst ? money(g.igst) : '', g && g.total != null ? money(g.total) : '',
      money(rupees(t.paise)), g && g.total != null ? money(r2(rupees(t.paise) - g.total)) : '', docNames.get(t.id).join(' | '), links(t).join(' | '), t.note || '',
      !hasInv ? (t.inv && t.inv.state === 'not_needed' ? 'No invoice (marked not needed)' : 'INVOICE MISSING') : !g ? 'Invoice attached; details not read' : notes.length ? notes.join('; ') : 'OK']);
    if (t.inv && t.inv.state === 'missing') issues.push(['Invoice missing', t, 'Attach the bill in Books or Telegram']);
    else if (hasInv && !g) issues.push(['Invoice details not read', t, 'Open it in Books and press "Read invoice"']);
    else if (notes.length) issues.push(['Invoice check: ' + notes.join('; '), t, 'Compare with the invoice and correct the details']);
    if (hasInv && !docNames.get(t.id).length && links(t).length) issues.push(['Invoice is only an email link', t, 'Open the email and save the PDF, or press "Save attachment" in Books']);
  }

  // Income
  const inc = [['Date received', 'Received from', 'Category', 'Export of services', 'Amount received', 'Your invoice no.', 'Document', 'Bank reference', 'Note']];
  for (const t of txns.filter(t => t.dir === 'in' && t.kind === 'business')) {
    inc.push([{ date: t.date }, who(t), t.cat || '', t.cat === 'Export revenue (foreign)' ? 'Yes' : '', money(rupees(t.paise)), (t.gst && t.gst.invNo) || '', docNames.get(t.id).concat(links(t)).join(' | '), t.ref || '', t.note || '']);
    if (t.cat === 'Export revenue (foreign)' && !(t.inv && t.inv.items && t.inv.items.length)) issues.push(['Export receipt without FIRC / bank advice', t, 'Attach the HDFC inward remittance advice email']);
  }

  // Inter-company & personal
  const other = [['Date', 'Type', 'Direction', 'Counterparty', 'Amount', 'Bank reference', 'Note']];
  for (const t of txns.filter(t => ['intercompany', 'personal', 'transfer'].includes(t.kind))) {
    other.push([{ date: t.date }, KINDS[t.kind][t.dir], t.dir === 'out' ? 'Out' : 'In', who(t), money(rupees(t.paise)), t.ref || '', t.note || '']);
  }

  // Remaining checks
  for (const t of txns) {
    if (t.status === 'todo') issues.push(['Not labelled', t, 'Label it in Books or Telegram']);
    if (t.recon === 'missing_in_stmt') issues.push(['Alert not found on the bank statement', t, 'Check with the bank statement; may be reversed or duplicated']);
    if (t.review) issues.push([t.review, t, 'Check amount and account against the email']);
  }
  const stmts = store.values('statements');
  const balances = accts.map(a => {
    const st = stmts.filter(s => s.acct === a.id && s.to >= from && s.from <= to).sort((x, y) => (x.from < y.from ? -1 : 1));
    const first = st[0], last = st[st.length - 1];
    const opening = first && first.from <= addDays(from, 3) ? first.opening : null;
    const closing = last && last.to >= addDays(to, -3) ? last.closing : null;
    if (!st.length) issues.push([`No bank statement imported for ${ledger.acctName(a.id)}`, null, 'Import the statement under Statements, so charges and cheques without alerts are included']);
    return { a, opening, closing, imported: st.length };
  });

  const sum = (f, list) => list.reduce((s, t) => s + (f(t) ? t.paise : 0), 0) / 100;
  const summary = [
    [{ bold: `${company.legalName || ENTITIES[entity]}` }],
    ['GSTIN', company.gstin ? company.gstin + (gstinValid(company.gstin) ? '' : '  (check digit fails: please verify)') : 'Not set (add it in Books → Setup)'],
    ['Period', `${dLong(from)} to ${dLong(to)}`],
    ['Prepared', `${dLong(new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10))} from bank alerts${stmts.length ? ' and imported statements' : ''} by Books`],
    [],
    [{ bold: 'Bank accounts' }, { bold: 'Opening balance' }, { bold: 'Closing balance' }, { bold: 'Statements imported' }],
    ...balances.map(b => [ledger.acctName(b.a.id), b.opening != null ? money(rupees(b.opening)) : 'Import statement', b.closing != null ? money(rupees(b.closing)) : 'Import statement', b.imported]),
    [],
    [{ bold: 'Totals' }, { bold: 'Amount' }],
    ['Money in (all)', money(sum(t => t.dir === 'in', txns))],
    ['Money out (all)', money(sum(t => t.dir === 'out', txns))],
    ['Business income', money(sum(t => t.dir === 'in' && t.kind === 'business', txns))],
    ['  of which export of services', money(sum(t => t.dir === 'in' && t.cat === 'Export revenue (foreign)', txns))],
    ['Business expenses', money(sum(t => t.dir === 'out' && t.kind === 'business', txns))],
    ['Personal spends from this account', money(sum(t => t.dir === 'out' && t.kind === 'personal', txns))],
    ['Inter-company in', money(sum(t => t.dir === 'in' && t.kind === 'intercompany', txns))],
    ['Inter-company out', money(sum(t => t.dir === 'out' && t.kind === 'intercompany', txns))],
    ['Not labelled yet', money(sum(t => t.status === 'todo', txns))],
    [],
    [{ bold: 'Expenses by category' }, { bold: 'Count' }, { bold: 'Paid' }, { bold: 'Taxable value' }, { bold: 'GST on invoices' }, { bold: 'With invoice' }],
    ...Object.entries(byCat).sort((a, b) => b[1].paid - a[1].paid).map(([k, c]) => [k, c.n, money(r2(c.paid)), c.taxable ? money(r2(c.taxable)) : '', c.gst ? money(r2(c.gst)) : '', `${c.withInv} of ${c.n}`]),
    [],
    ['Items to check', issues.length, issues.length ? 'See the "To check" sheet' : 'None'],
  ];
  const check = [['Issue', 'Date', 'Paid to / received from', 'Amount', 'What to do']].concat(issues.map(([i, t, todo]) => [i, t ? { date: t.date } : '', t ? who(t) : '', t ? money((t.dir === 'out' ? -1 : 1) * rupees(t.paise)) : '', todo]));

  const sheets = [
    { name: 'Summary', rows: summary, widths: [38, 18, 18, 18, 18, 14], freeze: 0 },
    { name: 'Bank book', rows: bank, widths: [12, 16, 30, 14, 14, 14, 16, 26, 26, 8, 20, 50, 40, 22] },
    { name: 'Expenses', rows: exp, widths: [12, 28, 18, 16, 16, 12, 26, 14, 12, 12, 12, 14, 14, 12, 40, 30, 24, 40] },
    { name: 'Income', rows: inc, widths: [12, 30, 26, 10, 16, 16, 40, 20, 24] },
    { name: 'Inter-company & personal', rows: other, widths: [12, 18, 10, 30, 14, 20, 30] },
    { name: 'To check', rows: check, widths: [44, 12, 30, 14, 50] },
  ];
  const csv = bank.map(r => r.map(v => {
    const s = v == null ? '' : typeof v === 'object' ? (v.date != null ? v.date : v.money != null ? v.money.toFixed(2) : '') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  return { sheets, csv, counts: { txns: txns.length, issues: issues.length, invoices: [...docNames.values()].flat().length } };
}

function buildPack(deps, { entity = 'all', from, to, label }) {
  const ents = entity === 'all' ? Object.keys(ENTITIES) : [entity];
  const fileList = []; const counts = {};
  for (const e of ents) {
    const r = companySheets(deps, e, from, to, fileList);
    fileList.push({ name: `${ENTITIES[e]}/${ENTITIES[e]} books ${from} to ${to}.xlsx`, data: xlsx(r.sheets) });
    fileList.push({ name: `${ENTITIES[e]}/Bank book ${from} to ${to}.csv`, data: '﻿' + r.csv });
    counts[e] = r.counts;
  }
  fileList.unshift({ name: 'README.txt', data: [
    `Books export: ${label || ''} (${from} to ${to})`.trim(), '',
    'One folder per company:',
    '  <Company> books ... .xlsx',
    '    Summary                    balances, totals, expenses by category with GST',
    '    Bank book                  every bank transaction with type, category and documents',
    '    Expenses                   purchase register: vendor, GSTIN, invoice no., taxable value, CGST/SGST/IGST',
    '    Income                     receipts, including export of services',
    '    Inter-company & personal   transfers between CodeCrust and AITA, own transfers, personal spends',
    '    To check                   anything missing or inconsistent',
    '  Bank book ... .csv           the bank book as CSV',
    '  Invoices/                    invoice and bill files, named date_vendor_amount',
    '',
    'GST figures come from the invoices (read by AI, then checked: GSTIN check digit, taxable + GST = total,',
    'CGST/SGST vs IGST by state, invoice total vs amount paid). Rows that failed a check are listed under "To check".',
  ].join('\r\n') });
  const name = `Books ${entity === 'all' ? 'CodeCrust + AITA' : ENTITIES[entity]} ${from} to ${to}.zip`;
  return { name, buffer: zip(fileList), counts };
}

module.exports = { buildPack, companySheets, period };
