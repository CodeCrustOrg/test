// Invoice details (vendor, GSTIN, invoice number, tax split) for the CA's purchase register.
// The AI reads the file; GSTIN check digit, tax arithmetic and payment match are checked here.
const fs = require('fs');
const P = require('../src/parser.js');
const { pdfLines } = require('./pdf.js');
const { gstinValid, findGstins } = require('../src/gst.js');

const num = s => { const v = P.toPaise(s); return v == null ? null : v / 100; };

async function readInvoice({ ledger, files, llm, gmail }, txnId) {
  const t = ledger.txn(txnId);
  if (!t) throw new Error('no such transaction');
  if (!llm || !llm.enabled()) throw new Error('Reading invoices needs OpenRouter. You can type the details in instead.');
  // Make sure email-linked invoices have their attachment saved locally first.
  for (const it of (t.inv && t.inv.items) || []) {
    if (it.type === 'gmail' && !it.fetched && gmail && gmail.configured()) await fetchEmailAttachments({ ledger, files, gmail }, txnId, it.id).catch(() => {});
  }
  const fileItems = ((ledger.txn(txnId).inv || {}).items || []).filter(i => i.type === 'file');
  if (!fileItems.length) throw new Error('Attach the invoice file first (upload it, or reply to the Telegram message with it).');
  let out = null, lastErr = null;
  for (const it of fileItems) {
    const f = files.get(it.id); if (!f) continue;
    const buf = fs.readFileSync(f.file);
    try {
      let text = '', o;
      if (f.meta.type === 'application/pdf') {
        text = (await pdfLines(buf)).flat().join('\n');
        if (text.replace(/\s/g, '').length < 40) throw new Error('This PDF is a scan with no text. Upload a photo of it instead, so it can be read as an image.');
        o = await llm.extractInvoice({ text });
      } else {
        o = await llm.extractInvoice({ image: buf.toString('base64'), mime: f.meta.type });
      }
      if (!o.is_invoice) { lastErr = new Error(`${f.meta.name} doesn't look like an invoice or bill.`); continue; }
      const gstin = String(o.gstin || '').toUpperCase().replace(/\s/g, '');
      const flags = [];
      if (gstin && !gstinValid(gstin)) flags.push('GSTIN as read fails the check digit: compare with the invoice');
      if (gstin && text && !findGstins(text).includes(gstin)) flags.push('GSTIN not found in the PDF text');
      out = {
        vendor: o.vendor || t.party || '', gstin, invNo: o.invoice_number || '', invDate: P.parseDate(o.invoice_date) || '',
        taxable: num(o.taxable_value), cgst: num(o.cgst), sgst: num(o.sgst), igst: num(o.igst), total: num(o.total),
        currency: (o.currency || 'INR').toUpperCase(), file: it.id, source: 'ai', flags, at: Date.now(),
      };
      break;
    } catch (e) { lastErr = e; }
  }
  if (!out) throw lastErr || new Error('No readable invoice file.');
  ledger.store.update('txns/' + txnId, { gst: out, updated: Date.now() });
  return out;
}

// Save the PDF/image attachments of an email linked as an invoice.
async function fetchEmailAttachments({ ledger, files, gmail }, txnId, emailId) {
  const atts = await gmail.attachmentsById(emailId);
  const t = ledger.txn(txnId);
  const items = ((t.inv && t.inv.items) || []).map(i => (i.type === 'gmail' && i.id === emailId ? { ...i, fetched: true } : i));
  const saved = [];
  for (const a of atts) {
    try { const meta = files.save(a.buf, a.filename, a.type); items.push({ type: 'file', id: meta.id, name: meta.name, fromEmail: emailId }); saved.push(meta.name); } catch (_) { /* skip types we don't keep */ }
  }
  ledger.store.update('txns/' + txnId, { inv: { state: 'attached', items }, updated: Date.now() });
  return saved;
}

module.exports = { readInvoice, fetchEmailAttachments };
