// client/src/lib/reportExport.js
// Shared PDF and Excel export helpers + a universal filter bar for reports.

import * as XLSX from 'xlsx';
import { exportTablePDF } from './pdf';

/**
 * Export a table to PDF using the shared branded template.
 *   rows: Array<Array<primitive>> — cell values
 *   cols: Array<string>           — column headers
 *   meta: { title, filename, totalsRow? }
 */
export function exportToPDF({ rows, cols, meta }) {
  const body = [...rows];
  if (meta?.totalsRow) body.push(meta.totalsRow);
  exportTablePDF({
    title:    meta?.title || 'Report',
    headers:  cols,
    rows:     body.map((r) => r.map((v) => v == null ? '' : String(v))),
    filename: meta?.filename || 'rekker-report',
  });
}

/**
 * Export a table to XLSX.
 *   rows: Array<Array<primitive>>
 *   cols: Array<string>
 *   meta: { title, filename, totalsRow?, sheetName? }
 */
export function exportToExcel({ rows, cols, meta }) {
  const body = [...rows];
  if (meta?.totalsRow) body.push(meta.totalsRow);
  const aoa = [cols, ...body];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);
  // auto-size columns to max content length
  ws['!cols'] = cols.map((c, i) => {
    const maxLen = Math.max(String(c).length,
      ...body.map((r) => (r[i] == null ? 0 : String(r[i]).length)));
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, meta?.sheetName || 'Report');
  XLSX.writeFile(wb, `${meta?.filename || 'rekker-report'}.xlsx`);
}

// Convenience: build a totals row given per-column reducers (Array<'sum'|null>).
export function computeTotalsRow(rows, reducers, labelCol = 0, label = 'TOTAL') {
  const totals = reducers.map((r, i) => {
    if (i === labelCol) return label;
    if (r === 'sum') {
      return rows.reduce((s, row) => {
        const n = Number(row[i]);
        return Number.isFinite(n) ? s + n : s;
      }, 0);
    }
    return '';
  });
  return totals;
}
