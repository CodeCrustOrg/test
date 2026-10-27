// PDF statements: text out of the PDF (pdf.js, password supported), rows from OpenRouter,
// then a mechanical balance check on every row before anything is reconciled.
const P = require('../src/parser.js');

let pdfjs = null;
async function lib() { return pdfjs || (pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')); }

// Group text items into lines by their vertical position; mark wide gaps as column breaks.
async function pdfLines(buf, password) {
  const { getDocument } = await lib();
  let doc;
  try { doc = await getDocument({ data: new Uint8Array(buf), password: password || undefined, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise; }
  catch (e) {
    if (e && e.name === 'PasswordException') { const err = new Error(password ? 'Wrong PDF password.' : 'This PDF needs its password.'); err.code = 'password'; throw err; }
    throw e;
  }
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push(row = { y, items: [] });
      row.items.push({ x, w: it.width || 0, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(rows.map(r => {
      r.items.sort((a, b) => a.x - b.x);
      let line = '', end = null;
      for (const it of r.items) { line += end == null ? it.s : (it.x - end > 12 ? ' | ' : ' ') + it.s; end = it.x + it.w; }
      return line.trim();
    }));
  }
  await doc.destroy();
  return pages;
}

// Turn model rows into statement rows (same shape as P.statementRows) and check the balance chain.
function normalise(rawRows) {
  const rows = [];
  for (const r of rawRows) {
    const date = P.parseDate(r.date);
    const dr = P.toPaise(r.debit), cr = P.toPaise(r.credit);
    const paise = dr || cr;
    if (!date || !paise) continue;
    const n = P.parseNarration(r.narration);
    rows.push({ date, narr: P.squash(r.narration), dir: dr ? 'out' : 'in', paise, balPaise: P.toPaise(r.balance), ref: n.ref, mode: n.mode, party: n.party, vpa: n.vpa });
  }
  return rows;
}

function chainBreaks(rows) {
  const breaks = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.balPaise == null || b.balPaise == null) continue;
    const expected = a.balPaise + (b.dir === 'in' ? b.paise : -b.paise);
    if (expected !== b.balPaise) breaks.push({ row: i, date: b.date, narr: b.narr, expected, printed: b.balPaise });
  }
  return breaks;
}

async function statementFromPdf(buf, password, llm) {
  const pages = await pdfLines(buf, password);
  const textChars = pages.flat().join('').length;
  if (textChars < 50) { const e = new Error('This PDF has no text layer (it is a scan), so it cannot be read. Download the Excel/CSV statement instead.'); e.code = 'scan'; throw e; }
  const raw = [];
  for (const lines of pages) if (lines.length) raw.push(...await llm.statementRows(lines));
  const rows = normalise(raw);
  const breaks = chainBreaks(rows);
  return { rows, totals: P.statementTotals(rows), breaks, pages: pages.length };
}

module.exports = { pdfLines, normalise, chainBreaks, statementFromPdf };
