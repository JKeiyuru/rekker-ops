// server/services/freshWorkbook.js
// Robust parser for the Fresh delivery workbook.
//
// Handles TWO layouts observed in real files:
//
// Layout A (older sheets, e.g. "1ST JAN"):
//   R1: [date, <blank>, T.Qty, BP, T.BP, SP, T.SP, QTY RECEIVED, Value Delivered, B.p delivered]
//   R2: [CATEGORY, HQ, ...]
//   R3+: [productName, hq_qty, T.Qty, BP, T.BP, SP, T.SP, qty_received, value_delivered, bp_delivered]
//
// Layout B (newer sheets, e.g. "30TH JUNE DC" / "30TH JUNE STORES"):
//   R1: [ORDERED, ..., BOUGHT, ..., DELIVERED, ...]  (zone markers, optional)
//   R2: [date, <lpo#s...>, T.QTY, Est. BP, T. EST. BP, SP, TOTAL VALUE ORDERED,
//        QTY, MARKET B.P, TOTAL MARKET BP., QTY RECEIVED, TOTAL VALUE DELIVERED,
//        EST. MARGN, COMMENTS]
//   R3: [CATEGORY, HQ/MEGA/WESTGATE/...]
//   R4+: product rows
//
// Sheet-name channel: 'STORES' if name contains STORES, else 'DC' (default —
// the workbook is a DC delivery ledger; sheets without a keyword are treated as DC).

const XLSX = require('xlsx');

const MONTHS = {
  JAN: 0, JANUARY: 0, FEB: 1, FEBRUARY: 1, MAR: 2, MARCH: 2, APR: 3, APRIL: 3,
  MAY: 4, JUN: 5, JUNE: 5, JUL: 6, JULY: 6, AUG: 7, AUGUST: 7,
  SEP: 8, SEPT: 8, SEPTEMBER: 8, OCT: 9, OCTOBER: 9, NOV: 10, NOVEMBER: 10, DEC: 11, DECEMBER: 11,
};

const cleanStr = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const upper = (v) => cleanStr(v).toUpperCase();
const num = (v) => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

function toDateKey(d) {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// ---- Sheet name parsing -----------------------------------------------------

function parseSheetName(name, fallbackYear = new Date().getFullYear()) {
  const s = upper(name);
  if (!s) return null;

  let channel = 'DC';
  if (s.includes('STORES')) channel = 'STORES';
  else if (s.includes(' DC') || s.endsWith(' DC') || / DC$/.test(s)) channel = 'DC';

  const m = s.match(/(\d{1,2})(?:ST|ND|RD|TH)?[\s.]+([A-Z]+)(?:\s+(\d{2,4}))?/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2]];
  if (month == null || !day) return null;
  let year = m[3] ? parseInt(m[3], 10) : fallbackYear;
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) return null;
  return { date, channel };
}

// ---- Header detection -------------------------------------------------------

const HEADER_MAP = [
  ['tQty',        ['T.QTY', 'T QTY', 'TQTY', 'T.Q TY', 'TOTAL QTY']],
  ['estBP',       ['EST. BP', 'EST BP', 'ESTBP', 'BP']],
  ['tEstBP',      ['T. EST. BP', 'T.EST.BP', 'T EST BP', 'T.BP', 'TOTAL EST BP']],
  ['sp',          ['SP']],
  ['tSP',         ['T.SP', 'T SP', 'TSP', 'TOTAL VALUE ORDERED', 'TOTAL VALUE ORDER']],
  ['boughtQty',   ['QTY']], // ambiguous with QTY RECEIVED — handled below
  ['boughtBP',    ['MARKET B.P', 'MARKET BP', 'M B.P', 'MBP']],
  ['boughtTotal', ['TOTAL MARKET BP.', 'TOTAL MARKET BP', 'TOTAL MARKET B.P', 'TOTAL BP']],
  ['delQty',      ['QTY RECEIVED', 'RECEIVED']],
  ['delTotal',    ['TOTAL VALUE DELIVERED', 'VALUE DELIVERED', 'TOTAL DELIVERED']],
  ['delBP',       ['B.P OF ITEMS DELIVERED', 'BP OF ITEMS DELIVERED', 'B.P DELIVERED', 'BP DELIVERED']],
  ['margn',       ['EST. MARGN', 'EST MARGN', 'MARGIN', 'EST MARGIN']],
  ['comments',    ['COMMENTS', 'COMMENT']],
];

// Try to identify the header row within the first N rows.
// Header row = row that contains T.Qty (or T.QTY, TQTY) as a cell.
function findHeaderRow(grid) {
  for (let r = 0; r < Math.min(grid.length, 5); r++) {
    for (let c = 0; c < (grid[r] || []).length; c++) {
      const v = upper(grid[r][c]).replace(/\s+/g, '');
      if (v === 'T.QTY' || v === 'TQTY' || v === 'TOTALQTY') return r;
    }
  }
  return -1;
}

function mapHeaders(headerRow) {
  const cols = {};
  const row = headerRow.map((v) => upper(v).replace(/\s+/g, ' ').trim());
  for (const [key, aliases] of HEADER_MAP) {
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      if (aliases.some((a) => cell === a || cell.replace(/\s+/g, '') === a.replace(/\s+/g, ''))) {
        // boughtQty ambiguous with 'QTY' inside 'QTY RECEIVED'
        if (key === 'boughtQty' && cell === 'QTY') {
          // Only accept if there's a tSP col before it
          if (cols.tSP != null && c > cols.tSP) { cols[key] = c; break; }
          continue;
        }
        if (cols[key] == null) { cols[key] = c; break; }
      }
    }
  }
  return cols;
}

// Branch row detection: prefer the row after header when its col[0] looks like a
// category label (uppercase text, no digits). Otherwise use the header row itself.
function findBranchRow(grid, headerIdx, cols) {
  const nextRow = grid[headerIdx + 1] || [];
  const firstCol = cleanStr(nextRow[0]);
  const looksCategory = firstCol && /^[A-Z][A-Z\s&/-]{2,}$/i.test(firstCol) && !/\d/.test(firstCol);
  if (looksCategory) return headerIdx + 1;

  // Otherwise header row may contain branch codes in cols 1..(tQty-1)
  const headerRow = grid[headerIdx] || [];
  const branchEnd = cols.tQty ?? headerRow.length;
  let textish = 0;
  for (let c = 1; c < branchEnd; c++) {
    const v = cleanStr(headerRow[c]);
    if (v && !/^\d[\d.,]*$/.test(v) && !(headerRow[c] instanceof Date)) textish++;
  }
  if (textish > 0) return headerIdx;
  return headerIdx + 1;
}

function extractBranches(branchRow, cols) {
  const branchEnd = cols.tQty ?? branchRow.length;
  const branches = [];
  for (let c = 1; c < branchEnd; c++) {
    const raw = cleanStr(branchRow[c]);
    if (!raw) continue;
    // Skip pure numeric (LPO#s masquerading as branch cells)
    if (/^\d[\d.,\/-]*$/.test(raw)) continue;
    branches.push({ col: c, branch: upper(raw) });
  }
  return branches;
}

// ---- Category detection so we skip section header rows in the data range ----
function isCategoryRow(row, cols) {
  const first = cleanStr(row[0]);
  if (!first) return false;
  const branchEnd = cols.tQty ?? row.length;
  // Category: uppercase alphabetic first cell + all numeric-relevant cols empty
  const hasProductData = [cols.tQty, cols.estBP, cols.sp, cols.tSP, cols.delQty]
    .some((c) => c != null && num(row[c]) != null);
  if (hasProductData) return false;
  // Cells inside branch range have anything?
  let branchHas = false;
  for (let c = 1; c < branchEnd; c++) {
    const v = row[c];
    if (v != null && v !== '') { branchHas = true; break; }
  }
  // If all branch cells are text/empty and no numeric product cols, treat as category
  return !branchHas || /^[A-Z][A-Z\s&/-]+$/.test(first.toUpperCase());
}

// ---- Sheet parse ------------------------------------------------------------

function parseSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

  const parsed = parseSheetName(sheetName);
  if (!parsed) throw new Error(`Sheet "${sheetName}" name has no recognizable date`);

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  const warnings = [];
  if (!grid.length) return { ...parsed, sheetName, rows: [], warnings: [{ code: 'empty_sheet', message: 'Sheet is empty' }] };

  const headerIdx = findHeaderRow(grid);
  if (headerIdx < 0) {
    return { ...parsed, sheetName, rows: [], warnings: [{ code: 'no_header', message: 'Could not locate T.Qty header row' }] };
  }
  const cols = mapHeaders(grid[headerIdx]);
  if (cols.tQty == null) {
    return { ...parsed, sheetName, rows: [], warnings: [{ code: 'no_header', message: 'T.Qty column missing' }] };
  }
  const branchIdx = findBranchRow(grid, headerIdx, cols);
  const branches = extractBranches(grid[branchIdx] || [], cols);
  if (branches.length === 0) {
    // Default to HQ so rows still ingest (matches DC-only sheets)
    branches.push({ col: 1, branch: 'HQ' });
    warnings.push({ code: 'branches_defaulted', message: 'No branch names detected — defaulted to HQ' });
  }

  const dataStart = Math.max(headerIdx, branchIdx) + 1;
  const isDC = parsed.channel === 'DC';
  const rows = [];

  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r] || [];
    const productName = cleanStr(row[0]);
    if (!productName) continue;
    const productUpper = productName.toUpperCase();
    if (productUpper === 'TOTAL' || productUpper.startsWith('TOTAL ') || productUpper.startsWith('GRAND TOTAL')) break;

    // Skip category / section headers
    if (isCategoryRow(row, cols)) continue;

    const estBP  = cols.estBP  != null ? num(row[cols.estBP])  : null;
    const spPrice = cols.sp     != null ? num(row[cols.sp])     : null;
    const tSPv   = cols.tSP    != null ? num(row[cols.tSP])    : null;
    const tQtyv  = cols.tQty   != null ? num(row[cols.tQty])   : null;
    const tEstBPv = cols.tEstBP != null ? num(row[cols.tEstBP]) : null;

    // Bought zone — explicit if layout B has these columns
    const boughtQtyExpl   = cols.boughtQty   != null ? num(row[cols.boughtQty])   : null;
    const boughtBPExpl    = cols.boughtBP    != null ? num(row[cols.boughtBP])    : null;
    const boughtTotalExpl = cols.boughtTotal != null ? num(row[cols.boughtTotal]) : null;

    // In layout A, "T.Qty / BP / T.BP" IS effectively the bought quantity & value
    // (there's no separate BOUGHT zone). Detect layout A = no boughtQty column at all.
    const layoutA = cols.boughtQty == null && cols.boughtTotal == null && cols.boughtBP == null;
    const boughtQty   = boughtQtyExpl   ?? (layoutA ? tQtyv    : null);
    const boughtBP    = boughtBPExpl    ?? (layoutA ? estBP    : null);
    const boughtTotal = boughtTotalExpl ?? (layoutA ? tEstBPv  : null);

    // Delivered zone
    const delQty      = cols.delQty   != null ? num(row[cols.delQty])   : null;
    const delTotal    = cols.delTotal != null ? num(row[cols.delTotal]) : null;
    const delComments = cols.comments != null ? cleanStr(row[cols.comments]) : '';

    if (isDC) {
      // DC sheets: single HQ row per product
      const branch = branches[0]?.branch || 'HQ';
      const orderedQty = tQtyv;
      rows.push({
        branch,
        productName,
        ordered:   { qty: orderedQty, estBP, spPrice, totalValue: tSPv ?? (orderedQty != null && spPrice != null ? orderedQty * spPrice : null) },
        bought:    { qty: boughtQty, marketBP: boughtBP, totalValue: boughtTotal },
        delivered: { qty: delQty, totalValue: delTotal, comments: delComments },
      });
      continue;
    }

    // STORES: one output row per branch that has a qty (always emit first branch to attach bought/delivered)
    let firstBranch = true;
    for (const bc of branches) {
      const orderedQty = num(row[bc.col]);
      if (orderedQty == null && !firstBranch) continue;
      rows.push({
        branch: bc.branch,
        productName,
        ordered:   {
          qty: orderedQty,
          estBP,
          spPrice,
          totalValue: (orderedQty != null && spPrice != null) ? orderedQty * spPrice : null,
        },
        bought:    firstBranch ? { qty: boughtQty, marketBP: boughtBP, totalValue: boughtTotal } : {},
        delivered: firstBranch ? { qty: delQty, totalValue: delTotal, comments: delComments } : {},
      });
      firstBranch = false;
    }
  }

  if (rows.length === 0) {
    warnings.push({ code: 'no_rows', message: 'Header located but no product rows found below it' });
  }

  return { ...parsed, sheetName, rows, warnings };
}

function parseWorkbookBase64(base64) {
  const buf = Buffer.from(base64, 'base64');
  return XLSX.read(buf, { type: 'buffer', cellDates: false });
}

function listOperationalSheets(workbook) {
  return workbook.SheetNames
    .map((n) => ({ name: n, parsed: parseSheetName(n) }))
    .filter((s) => !!s.parsed);
}

module.exports = {
  parseWorkbookBase64,
  parseSheet,
  parseSheetName,
  listOperationalSheets,
  toDateKey,
  cleanStr,
  upper,
  num,
};
