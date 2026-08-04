// client/src/components/ExportButtons.jsx
// Shared PDF + Excel export pair. Pass a builder that returns { cols, rows, totalsRow }.

import { FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportToPDF, exportToExcel } from '@/lib/reportExport';
import toast from 'react-hot-toast';

export default function ExportButtons({ build, title, filename, size = 'sm', disabled }) {
  const run = (fn) => {
    try {
      const data = build();
      if (!data || !data.rows?.length) { toast.error('Nothing to export'); return; }
      const cols = data.cols;
      const headers = cols.map((c) => c.label);
      const toArr = (o) => cols.map((c) => {
        const v = o?.[c.key];
        if (v == null) return '';
        return typeof v === 'number' ? v : String(v);
      });
      fn({
        cols: headers,
        rows: data.rows.map(toArr),
        meta: { title, filename, totalsRow: data.totalsRow ? toArr(data.totalsRow) : undefined },
      });
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    }
  };


  return (
    <div className="flex gap-1">
      <Button variant="outline" size={size} disabled={disabled} onClick={() => run(exportToPDF)}>
        <FileText className="w-3.5 h-3.5" /> PDF
      </Button>
      <Button variant="outline" size={size} disabled={disabled} onClick={() => run(exportToExcel)}>
        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
      </Button>
    </div>
  );
}
