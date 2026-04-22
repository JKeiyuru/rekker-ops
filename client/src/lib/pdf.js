// client/src/lib/pdf.js
// Utility functions for generating PDF reports.
// Uses jsPDF + jspdf-autotable.
// Install: npm install jspdf jspdf-autotable

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND_ORANGE = [255, 107, 44];
const DARK_BG      = [15, 17, 23];
const LIGHT_TEXT   = [220, 225, 235];

// ── Header banner ─────────────────────────────────────────────────────────────
function addHeader(doc, title, subtitle) {
  const w = doc.internal.pageSize.getWidth();

  // Background bar
  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, w, 28, 'F');

  // Orange accent line
  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 28, w, 2, 'F');

  // REKKER wordmark
  doc.setTextColor(...BRAND_ORANGE);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('REKKER', 14, 12);

  doc.setTextColor(...LIGHT_TEXT);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('OPERATIONS PLATFORM', 14, 18);

  // Report title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), w - 14, 12, { align: 'right' });

  if (subtitle) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...LIGHT_TEXT);
    doc.text(subtitle, w - 14, 20, { align: 'right' });
  }

  // Generated timestamp
  doc.setTextColor(120, 130, 150);
  doc.setFontSize(7);
  doc.text(`Generated: ${new Date().toLocaleString('en-KE')}`, 14, 24);

  return 36; // Y offset after header
}

// ── Footer ────────────────────────────────────────────────────────────────────
function addFooter(doc) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const pages = doc.internal.getNumberOfPages();

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(240, 241, 243);
    doc.rect(0, h - 10, w, 10, 'F');
    doc.setTextColor(120, 130, 150);
    doc.setFontSize(7);
    doc.text('Rekker Limited — Confidential', 14, h - 3);
    doc.text(`Page ${i} of ${pages}`, w - 14, h - 3, { align: 'right' });
  }
}

// ── Table style defaults ──────────────────────────────────────────────────────
const TABLE_STYLES = {
  headStyles: {
    fillColor: DARK_BG,
    textColor: BRAND_ORANGE,
    fontSize: 7,
    fontStyle: 'bold',
    halign: 'left',
  },
  bodyStyles: {
    fontSize: 8,
    textColor: [40, 45, 55],
  },
  alternateRowStyles: {
    fillColor: [247, 248, 250],
  },
  margin: { left: 14, right: 14 },
};

// ── Attendance report ─────────────────────────────────────────────────────────
export function exportAttendancePDF({ date, sessions, assignments, summary }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = addHeader(doc, 'Attendance Report', `Date: ${date}`);

  // Summary boxes
  const boxes = [
    { label: 'Assigned',   value: summary?.totalAssigned    ?? 0 },
    { label: 'Checked In', value: summary?.totalCheckedIn   ?? 0 },
    { label: 'Absent',     value: summary?.totalAbsent      ?? 0 },
    { label: 'Flagged',    value: summary?.flaggedSessions  ?? 0 },
    { label: 'Complete',   value: summary?.completeSessions ?? 0 },
    { label: 'Incomplete', value: summary?.incompleteSessions ?? 0 },
  ];

  const boxW = (doc.internal.pageSize.getWidth() - 28) / boxes.length;
  boxes.forEach((b, i) => {
    const x = 14 + i * boxW;
    doc.setFillColor(247, 248, 250);
    doc.rect(x, y, boxW - 2, 16, 'F');
    doc.setTextColor(...DARK_BG);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(String(b.value), x + boxW / 2 - 1, y + 9, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 110, 130);
    doc.text(b.label.toUpperCase(), x + boxW / 2 - 1, y + 14, { align: 'center' });
  });

  y += 22;

  // Sessions table
  const rows = (sessions || []).map((s) => {
    const late = s.lateByMinutes;
    let lateLabel = '—';
    if (late != null) {
      if (late <= 0)  lateLabel = `Early (${Math.abs(late)}m)`;
      else if (late <= 10) lateLabel = `On time (+${late}m)`;
      else if (late <= 30) lateLabel = `Late (${late}m)`;
      else             lateLabel = `Very late (${late}m)`;
    }

    return [
      s.merchandiser?.fullName || '—',
      s.branch?.name || '—',
      s.expectedCheckIn || '—',
      s.checkInTime ? new Date(s.checkInTime).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—',
      lateLabel,
      s.checkOutTime ? new Date(s.checkOutTime).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—',
      s.durationMinutes != null ? `${s.durationMinutes}m` : '—',
      s.checkInDistanceMeters != null ? `${s.checkInDistanceMeters}m` : '—',
      s.sessionStatus,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Merchandiser', 'Branch', 'Expected', 'Checked In', 'Timeliness', 'Checked Out', 'Duration', 'Distance', 'Status']],
    body: rows,
    ...TABLE_STYLES,
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 4) {
        const v = data.cell.raw;
        if (v.startsWith('Early') || v.startsWith('On time')) data.cell.styles.textColor = [16, 185, 129];
        else if (v.startsWith('Late')) data.cell.styles.textColor = [245, 158, 11];
        else if (v.startsWith('Very')) data.cell.styles.textColor = [239, 68, 68];
      }
    },
  });

  addFooter(doc);
  doc.save(`rekker-attendance-${date}.pdf`);
}

// ── Merchandiser report ───────────────────────────────────────────────────────
export function exportMerchandiserPDF({ name, report, dateRange }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const subtitle = dateRange?.start ? `${dateRange.start} → ${dateRange.end}` : 'All time';
  let y = addHeader(doc, `Merchandiser Report`, `${name} · ${subtitle}`);

  // Stats row
  const stats = [
    ['Total Sessions', report.totalSessions],
    ['Complete', report.completeSessions],
    ['Incomplete', report.incompleteSessions],
    ['Hours Worked', `${report.totalHoursWorked}h`],
    ['Late Arrivals', report.lateArrivals],
    ['Days Absent', report.daysAbsent],
    ['Mismatches', report.locationMismatches],
  ];

  const w = doc.internal.pageSize.getWidth();
  const bw = (w - 28) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = 14 + i * bw;
    doc.setFillColor(247, 248, 250);
    doc.rect(x, y, bw - 2, 18, 'F');
    doc.setTextColor(...DARK_BG);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(String(value), x + bw / 2 - 1, y + 9, { align: 'center' });
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 110, 130);
    doc.text(label.toUpperCase(), x + bw / 2 - 1, y + 15, { align: 'center' });
  });

  y += 24;

  const rows = (report.sessions || []).map((s) => [
    s.date,
    s.branch?.name || '—',
    s.expectedCheckIn || '—',
    s.checkInTime ? new Date(s.checkInTime).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—',
    s.lateByMinutes != null ? (s.lateByMinutes > 0 ? `+${s.lateByMinutes}m` : `${s.lateByMinutes}m`) : '—',
    s.checkOutTime ? new Date(s.checkOutTime).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—',
    s.durationMinutes != null ? `${s.durationMinutes}m` : '—',
    s.sessionStatus,
    s.checkInStatus,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Branch', 'Expected', 'Check-In', 'Diff', 'Check-Out', 'Duration', 'Session', 'Location']],
    body: rows,
    ...TABLE_STYLES,
  });

  addFooter(doc);
  doc.save(`rekker-merchandiser-${name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

// ── LPO / Invoice reports ─────────────────────────────────────────────────────
export function exportTablePDF({ title, headers, rows, filename }) {
  const doc = new jsPDF({ orientation: rows.length > 20 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const y = addHeader(doc, title, `${rows.length} records`);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    ...TABLE_STYLES,
  });

  addFooter(doc);
  doc.save(`${filename || 'rekker-export'}.pdf`);
}
