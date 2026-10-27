// GST checks that need no AI: GSTIN check digit, state, tax arithmetic, CGST/SGST vs IGST.
// Shared by the server (export, invoice reading) and the page (inlined at build time).
(function (root) {
'use strict';
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;

const STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh', '24': 'Gujarat', '25': 'Daman & Diu (old code)', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh (old code)', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other Territory',
};

function gstinValid(g) {
  g = String(g || '').toUpperCase().trim();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g) || !STATES[g.slice(0, 2)]) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) { const p = CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); }
  return CHARS[(36 - (sum % 36)) % 36] === g[14];
}

function findGstins(text) { return [...new Set((String(text || '').toUpperCase().match(GSTIN_RE) || []).filter(gstinValid))]; }

const n = v => (v == null || v === '' || isNaN(Number(v)) ? 0 : Number(v));
const r2 = v => Math.round(v * 100) / 100;

// gst: {gstin, taxable, cgst, sgst, igst, total}; paidPaise: bank amount; ownGstin: the company's GSTIN if known.
function checkInvoice(gst, paidPaise, ownGstin) {
  const issues = [];
  if (!gst) return { issues: ['No invoice details'] };
  const tax = r2(n(gst.cgst) + n(gst.sgst) + n(gst.igst));
  if (gst.gstin && !gstinValid(gst.gstin)) issues.push('Vendor GSTIN fails the check digit');
  if (gst.total && gst.taxable && Math.abs(n(gst.taxable) + tax - n(gst.total)) > 1) issues.push(`Taxable ${r2(n(gst.taxable))} + GST ${tax} ≠ total ${r2(n(gst.total))}`);
  if (n(gst.cgst) && Math.abs(n(gst.cgst) - n(gst.sgst)) > 0.5) issues.push('CGST and SGST should be equal');
  if (n(gst.igst) && (n(gst.cgst) || n(gst.sgst))) issues.push('Both IGST and CGST/SGST charged');
  if (gst.gstin && ownGstin && gstinValid(gst.gstin) && gstinValid(ownGstin)) {
    const same = gst.gstin.slice(0, 2) === ownGstin.slice(0, 2);
    if (same && n(gst.igst)) issues.push('Vendor is in your state: expected CGST + SGST, not IGST');
    if (!same && (n(gst.cgst) || n(gst.sgst))) issues.push('Vendor is in another state: expected IGST, not CGST + SGST');
  }
  if (gst.total && paidPaise && Math.abs(n(gst.total) * 100 - paidPaise) > 100) issues.push(`Invoice total ₹${r2(n(gst.total))} differs from the payment ₹${paidPaise / 100}`);
  if (gst.gstin && !tax) issues.push('GSTIN present but no GST amount');
  return { tax, issues, state: gst.gstin ? STATES[String(gst.gstin).slice(0, 2)] || null : null };
}

const api = { gstinValid, findGstins, checkInvoice, STATES };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.GST = api;
})(typeof window !== 'undefined' ? window : globalThis);
