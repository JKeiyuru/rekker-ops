// client/src/lib/docLineItems.js
//
// Turns raw text lines (from pdfExtract) into product line items, then compares
// an LPO's items against an invoice's items to produce the disparity product
// list used by the packaging invoice workflow.
//
// The parser is layout-agnostic on purpose: our invoices are column PDFs and
// customer LPOs arrive as pipe-delimited faxes, so instead of hard-coding
// columns we look for the arithmetic fingerprint of a line item:
//
//        quantity  ×  unit price  ≈  line total
//
// Whatever text precedes that triple is the product description. This also
// rescues OCR mistakes (a "6" read as "o") because the quantity can be
// recovered from total ÷ price.

const NUM_RE = /-?\d[\d,]*(?:\.\d+)?/g;

function toNumber(raw) {
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function numericTokens(line) {
  const out = [];
  let m;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(line)) !== null) {
    const value = toNumber(m[0]);
    if (value === null) continue;
    out.push({ value, start: m.index, end: m.index + m[0].length, raw: m[0] });
  }
  return out;
}

const NOISE_RE = /(sub\s*total|subtotal|total\b|balance|tax summary|vat @|invoice no|purchase order|delivery date|order date|page\b|amount due|grand total|discount|net\b|terms|signature|special conditions|note\b)/i;

function cleanName(raw) {
  return raw
    .replace(/[|]+/g, ' ')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/[^A-Za-z0-9 ().*/+&'"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse product line items out of raw text lines.
 * @returns {Array<{ name: string, quantity: number, unitPrice: number|null, lineTotal: number|null, source: string }>}
 */
export function parseLineItems(lines = []) {
  const items = [];

  lines.forEach((rawLine) => {
    const line = String(rawLine || '').replace(/\s+/g, ' ').trim();
    if (line.length < 6) return;
    if (NOISE_RE.test(line)) return;

    const nums = numericTokens(line);
    if (nums.length < 3) return;

    // Find qty × price ≈ total among consecutive-ish numbers.
    let best = null;
    for (let i = 0; i < nums.length - 2; i += 1) {
      for (let j = i + 1; j < nums.length - 1; j += 1) {
        for (let k = j + 1; k < nums.length; k += 1) {
          const qty = nums[i].value;
          const price = nums[j].value;
          const total = nums[k].value;
          if (qty <= 0 || qty > 100000 || price <= 0 || total <= 0) continue;
          if (!Number.isFinite(qty) || Math.abs(qty - Math.round(qty)) > 0.001 && qty < 1) continue;
          const expected = qty * price;
          const tolerance = Math.max(1, Math.abs(total) * 0.01);
          if (Math.abs(expected - total) > tolerance) continue;
          const score = k - i; // prefer the tightest triple
          if (!best || score < best.score) best = { score, qtyTok: nums[i], price, total };
        }
      }
    }

    let inferred = false;
    if (!best) {
      // OCR often mangles the quantity column ("6" read as "o"). Recover it
      // from the adjacent unit-price / line-total pair.
      for (let j = 0; j < nums.length - 1; j += 1) {
        const price = nums[j].value;
        const total = nums[j + 1].value;
        if (price < 1 || total < 10 || total <= price) continue;
        const qty = total / price;
        const rounded = Math.round(qty);
        if (rounded < 2 || rounded > 100000) continue;
        if (Math.abs(qty - rounded) > 0.01) continue;
        if (best && total <= best.total) continue;
        best = { qtyTok: { start: nums[j].start, value: rounded }, price, total };
        inferred = true;
      }
    }

    if (!best) return;

    let name = cleanName(line.slice(0, best.qtyTok.start));
    // Drop the stray character left behind by an unreadable qty cell.
    if (inferred) name = name.replace(/\s+[A-Za-z0-9]$/, '').trim();

    // A description must actually contain words, not just codes.
    const letters = name.replace(/[^A-Za-z]/g, '');
    if (letters.length < 3) return;

    items.push({
      name,
      quantity: best.qtyTok.value,
      unitPrice: best.price,
      lineTotal: best.total,
      inferred,
      source: line,
    });

  });

  return dedupe(items);
}

function dedupe(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = `${normalizeName(it.name)}|${it.unitPrice}`;
    const prev = map.get(key);
    if (prev) prev.quantity += it.quantity;
    else map.set(key, { ...it });
  });
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set(['the', 'and', 'with', 'pcs', 'pc', 'set', 'no']);

export function normalizeName(name = '') {
  return String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(name) {
  return normalizeName(name)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t.toLowerCase()));
}

/** Dice coefficient over word tokens, 0..1 */
export function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.length || !B.length) return 0;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const setB = new Set(B);
  let hits = 0;
  A.forEach((t) => { if (setB.has(t)) hits += 1; });
  const dice = (2 * hits) / (A.length + B.length);
  if (dice < 0.5 && (na.includes(nb) || nb.includes(na))) return 0.75;
  return dice;
}

/**
 * Compare LPO items against invoice items.
 * @returns {{
 *   disparities: Array<{ product: string, quantity: number, unit: string, note: string, kind: string, lpoQty: number|null, invoiceQty: number|null, confidence: number }>,
 *   matched: Array<object>
 * }}
 */
export function buildDisparities(lpoItems = [], invoiceItems = [], { threshold = 0.55 } = {}) {
  const invUsed = new Set();
  const disparities = [];
  const matched = [];

  lpoItems.forEach((lpoIt) => {
    let bestIdx = -1;
    let bestScore = 0;
    invoiceItems.forEach((invIt, idx) => {
      if (invUsed.has(idx)) return;
      const s = similarity(lpoIt.name, invIt.name);
      if (s > bestScore) { bestScore = s; bestIdx = idx; }
    });

    if (bestIdx >= 0 && bestScore >= threshold) {
      invUsed.add(bestIdx);
      const invIt = invoiceItems[bestIdx];
      const diff = Number((lpoIt.quantity - invIt.quantity).toFixed(2));
      matched.push({ lpo: lpoIt, invoice: invIt, score: bestScore, diff });
      if (Math.abs(diff) > 0.001) {
        disparities.push({
          product: lpoIt.name,
          quantity: Math.abs(diff),
          unit: '',
          note:
            diff > 0
              ? `Short delivered — LPO ${lpoIt.quantity}, invoiced ${invIt.quantity}`
              : `Over invoiced — LPO ${lpoIt.quantity}, invoiced ${invIt.quantity}`,
          kind: diff > 0 ? 'short' : 'over',
          lpoQty: lpoIt.quantity,
          invoiceQty: invIt.quantity,
          confidence: bestScore,
        });
      }
    } else {
      disparities.push({
        product: lpoIt.name,
        quantity: lpoIt.quantity,
        unit: '',
        note: 'On LPO, not on invoice',
        kind: 'missing',
        lpoQty: lpoIt.quantity,
        invoiceQty: 0,
        confidence: bestScore,
      });
    }
  });

  invoiceItems.forEach((invIt, idx) => {
    if (invUsed.has(idx)) return;
    disparities.push({
      product: invIt.name,
      quantity: invIt.quantity,
      unit: '',
      note: 'On invoice, not on LPO',
      kind: 'extra',
      lpoQty: 0,
      invoiceQty: invIt.quantity,
      confidence: 0,
    });
  });

  return { disparities, matched };
}
