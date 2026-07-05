// server/services/freshWorkbook.js
// Parses the Fresh Excel workbook and produces normalized line records.
// Layout expectations (per PRD §5):
//   Row 1: zone markers containing 'ORDERED', 'BOUGHT', 'DELIVERED'
//   Row 2: column headers within each zone
//   Row 3: branch codes under ordered zone (DC sheets are HQ)
//   Row 4+: product rows, until a TOTAL row
//
// Robust to: shifting columns per day, duplicate product names, stray whitespace,
// oversized ranges (bounded by TOTAL marker + non-empty product name column).

const XLSX = require('xlsx');

const CHANNEL_KEYWORDS = { STORES: 'STORES', DC: 'DC' };

const MONTHS = {
  JAN: 0, JANUARY: 0, FEB: 1, FEBRUARY: 1, MAR: 2, MARCH: 2, APR: 3, APRIL: 3,
  MAY: 4, JUN: 5, JUNE: 5, JUL: 6, JULY: 6, AUG: 7, AUGUST: 7,
  SEP: 8, SEPT: 8, SEPTEMBER: 8, OCT: 9, OCTOBER: 9, NOV: 10, NOVEMBER: 10, DEC: 11, DECEMBER: 11,
};

function cleanStr(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function upper(v) { return cleanStr(v).toUpperCase(); }

function isNumeric(v) {
  if (v == null || v === '') return false;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n);
}
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Parse sheet name like "30TH JUNE STORES" or "01ST JULY DC" into { date, channel }
function parseSheetName(name, fallbackYear = new Date().getFullYear()) {
  const s = upper(name);
  let channel = null;
  if (s.includes(' DC') || s.endsWith('DC') || s.startsWith('DC ')) channel = 'DC';
  else if (s.includes('STORES')) channel = 'STORES';
  if (!channel) return null;

  const m = s.match(/(\d{1,2})(?:ST|ND|RD|TH)?\s+([A-Z]+)(?:\s+(\d{2,4}))?/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthKey = m[2];
  const month = MONTHS[monthKey];
  if (month == null) return null;
  let year = m[3] ? parseInt(m[3], 10) : fallbackYear;
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) return null;
  return { date, channel };
}

function toDateKey(d) {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// Locate ORDERED/BOUGHT/DELIVERED zone start columns from row 1 text.
function findZones(row1) {
  const zones = { ordered: null, bought: null, delivered: null };
  for (let c = 0; c < row1.length; c++) {
    const v = upper(row1[c]);
    if (!v) continue;
    if (zones.ordered == null && v.includes('ORDER'))    zones.ordered = c;
    if (zones.bought == null  && v.includes('BOUGHT'))   zones.bought  = c;
    if (zones.delivered == null && (v.includes('DELIVER') || v.includes('RECEIVED'))) zones.delivered = c;
  }
  return zones;
}

// Within a zone, find columns by header keyword (row 2).
function findColByHeader(row2, startCol, endCol, keywords) {
  for (let c = startCol; c < endCol; c++) {
    const v = upper(row2[c]);
    if (!v) continue;
    if (keywords.some((k) => v.includes(k))) return c;
  }
  return null;
}

/**
 * Parse a single worksheet.
 * Returns { channel, date, sheetName, rows: [{branch, productName, ordered:{...}, bought:{...}, delivered:{...}}], warnings }
 */
function parseSheet(workbook, sheetName, opts = {}) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

  const parsed = parseSheetName(sheetName);
  if (!parsed) throw new Error(`Sheet name "${sheetName}" is not in expected format (e.g. "30TH JUNE STORES")`);

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  if (!grid.length) return { ...parsed, sheetName, rows: [], warnings: [{ code: 'empty_sheet', message: 'Sheet is empty' }] };

  const row1 = grid[0] || [];
  const row2 = grid[1] || [];
  const row3 = grid[2] || [];

  const zones = findZones(row1);
  const warnings = [];
  if (zones.ordered == null) warnings.push({ code: 'zone_missing', message: 'ORDERED zone not found on row 1' });

  // End columns for each zone (up to next zone start or grid width)
  const width = Math.max(row1.length, row2.length, row3.length, 10);
  const orderedEnd   = Math.min(zones.bought    ?? width, width);
  const boughtEnd    = Math.min(zones.delivered ?? width, width);
  const deliveredEnd = width;

  // Ordered-zone: branch columns come first (row3 has branch codes), then aggregate columns
  const orderedStart = (zones.ordered ?? 0) + 1;
  const branchCols = [];
  let firstAggInOrdered = orderedEnd;
  for (let c = orderedStart; c < orderedEnd; c++) {
    const label = upper(row2[c]) || '';
    const branchCode = upper(row3[c]) || '';
    // Aggregate columns typically named T.QTY, EST BP, T. EST. BP, SP, TOTAL VALUE ORDERED
    if (/^T[.\s]*QTY/.test(label) || label.includes('EST') || label === 'SP' || label.includes('TOTAL VALUE')) {
      firstAggInOrdered = c;
      break;
    }
    if (branchCode) branchCols.push({ col: c, branch: branchCode });
  }
  const orderedTotalCol = findColByHeader(row2, firstAggInOrdered, orderedEnd, ['TOTAL VALUE', 'TOTAL VALUE ORDERED']);
  const orderedTQtyCol  = findColByHeader(row2, firstAggInOrdered, orderedEnd, ['T.QTY', 'T QTY', 'TOTAL QTY']);
  const orderedSPCol    = findColByHeader(row2, firstAggInOrdered, orderedEnd, ['SP']);
  const orderedEstBPCol = findColByHeader(row2, firstAggInOrdered, orderedEnd, ['EST BP', 'EST. BP', 'ESTBP']);

  // Bought zone: QTY, MARKET B.P, TOTAL MARKET BP
  const boughtStart = (zones.bought ?? width) + 1;
  const boughtQtyCol   = findColByHeader(row2, boughtStart, boughtEnd, ['QTY']);
  const boughtBPCol    = findColByHeader(row2, boughtStart, boughtEnd, ['MARKET B.P', 'MARKET BP', 'MARKETBP', 'M B.P']);
  const boughtTotalCol = findColByHeader(row2, boughtStart, boughtEnd, ['TOTAL MARKET', 'TOTAL BP', 'TOTAL MARKET BP']);

  // Delivered zone: QTY RECEIVED, TOTAL VALUE DELIVERED, EST MARGN, COMMENTS
  const delStart = (zones.delivered ?? width) + 1;
  const delQtyCol      = findColByHeader(row2, delStart, deliveredEnd, ['QTY RECEIVED', 'RECEIVED', 'QTY']);
  const delTotalCol    = findColByHeader(row2, delStart, deliveredEnd, ['TOTAL VALUE', 'TOTAL DELIVERED']);
  const delCommentsCol = findColByHeader(row2, delStart, deliveredEnd, ['COMMENT']);

  // Product-name column: typically column 0 or 1. Pick leftmost cell with non-empty label in row 3+.
  let productNameCol = 0;
  for (let c = 0; c < orderedStart; c++) {
    const label = upper(row2[c]);
    if (label && (label.includes('PRODUCT') || label.includes('ITEM'))) { productNameCol = c; break; }
  }

  // Find the real data range: start = row index 3 (index 3), stop at TOTAL row.
  const dataStart = 3;
  let dataEnd = grid.length;
  for (let r = dataStart; r < grid.length; r++) {
    const nameCell = upper(grid[r][productNameCol]);
    if (!nameCell) {
      // allow 3 blank rows before treating as end
      let blank = true;
      for (let k = 0; k < 3 && r + k < grid.length; k++) {
        if (upper(grid[r + k][productNameCol])) { blank = false; break; }
      }
      if (blank) { dataEnd = r; break; }
    }
    if (nameCell === 'TOTAL' || nameCell.startsWith('TOTAL ')) { dataEnd = r; break; }
  }

  if (grid.length > 500 && dataEnd - dataStart < grid.length - dataStart) {
    warnings.push({ code: 'range_trimmed', message: `Trimmed oversized sheet: ${grid.length} rows → data ends at row ${dataEnd + 1}` });
  }

  const rows = [];
  const isDC = parsed.channel === 'DC';
  // For DC sheets, PRD says "DC sheets only have HQ" — force branch=HQ if none detected.
  if (isDC && branchCols.length === 0) branchCols.push({ col: null, branch: 'HQ' });

  for (let r = dataStart; r < dataEnd; r++) {
    const row = grid[r] || [];
    const productName = cleanStr(row[productNameCol]);
    if (!productName) continue;
    if (upper(productName) === 'TOTAL') break;

    const spPrice = orderedSPCol != null ? num(row[orderedSPCol]) : null;
    const estBP   = orderedEstBPCol != null ? num(row[orderedEstBPCol]) : null;

    // BOUGHT zone (single per row — one buy for the whole product)
    const boughtQty   = boughtQtyCol   != null ? num(row[boughtQtyCol])   : null;
    const boughtBP    = boughtBPCol    != null ? num(row[boughtBPCol])    : null;
    const boughtTotal = boughtTotalCol != null ? num(row[boughtTotalCol]) : null;

    // DELIVERED zone (single per row too — one delivery per product to that channel)
    const delQty      = delQtyCol      != null ? num(row[delQtyCol])      : null;
    const delTotal    = delTotalCol    != null ? num(row[delTotalCol])    : null;
    const delComments = delCommentsCol != null ? cleanStr(row[delCommentsCol]) : '';

    if (isDC) {
      // Single branch (HQ) captures ordered/bought/delivered for the row.
      const orderedTotal = orderedTotalCol != null ? num(row[orderedTotalCol]) : null;
      const orderedQty   = orderedTQtyCol  != null ? num(row[orderedTQtyCol])
                          : (branchCols[0].col != null ? num(row[branchCols[0].col]) : null);
      rows.push({
        branch: 'HQ',
        productName,
        ordered:   { qty: orderedQty, estBP, spPrice, totalValue: orderedTotal },
        bought:    { qty: boughtQty, marketBP: boughtBP, totalValue: boughtTotal },
        delivered: { qty: delQty, totalValue: delTotal, comments: delComments },
      });
      continue;
    }

    // STORES: emit one row per branch for ordered qty; bought & delivered attach only to first branch.
    let firstBranch = true;
    for (const bc of branchCols) {
      const orderedQty = bc.col != null ? num(row[bc.col]) : null;
      if (orderedQty == null && !firstBranch) continue;
      rows.push({
        branch: bc.branch,
        productName,
        ordered:   { qty: orderedQty, estBP, spPrice, totalValue: orderedQty != null && spPrice != null ? orderedQty * spPrice : null },
        bought:    firstBranch ? { qty: boughtQty,   marketBP: boughtBP, totalValue: boughtTotal } : {},
        delivered: firstBranch ? { qty: delQty, totalValue: delTotal, comments: delComments } : {},
      });
      firstBranch = false;
    }
  }

  return { ...parsed, sheetName, rows, warnings };
}

// Parse a base64 xlsx buffer.
function parseWorkbookBase64(base64) {
  const buf = Buffer.from(base64, 'base64');
  return XLSX.read(buf, { type: 'buffer', cellDates: false });
}

// List sheets with parseable date+channel names.
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
