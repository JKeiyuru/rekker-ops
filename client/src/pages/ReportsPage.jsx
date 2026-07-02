// client/src/pages/ReportsPage.jsx
// Packaging reports hub. Every tab supports PDF + Excel export.

import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Receipt, RotateCcw, Layers, Loader2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format } from 'date-fns';
import api from '@/lib/api';
import UniversalFilterBar from '@/components/UniversalFilterBar';
import { exportToPDF, exportToExcel, computeTotalsRow } from '@/lib/reportExport';

const ADJ_LABELS = {
  returned_goods: 'Returned Goods',
  not_delivered:  'Not Delivered',
  control_list:   'Control List',
  other:          'Other',
};

function fmt(n) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Reusable Report Table ────────────────────────────────────────────────────
function ReportTable({ cols, rows, totalsReducers, title, filename }) {
  const totalsRow = totalsReducers ? computeTotalsRow(rows, totalsReducers) : null;
  return (
    <div className="rounded-xl border border-rekker-border overflow-hidden bg-rekker-surface">
      <div className="flex items-center justify-between p-3 border-b border-rekker-border">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          {rows.length} records{totalsRow ? ' + totals' : ''}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() =>
            exportToPDF({ rows, cols, meta: { title, filename, totalsRow } })}>
            <Download className="w-3.5 h-3.5" /> PDF
          </Button>
          <Button size="sm" onClick={() =>
            exportToExcel({ rows, cols, meta: { title, filename, totalsRow } })}>
            <Download className="w-3.5 h-3.5" /> Excel
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rekker-border bg-rekker-surface/80">
              {cols.map((c) => (
                <th key={c} className="text-left px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-rekker-border/50 hover:bg-accent/20">
                {r.map((v, j) => (
                  <td key={j} className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{v ?? ''}</td>
                ))}
              </tr>
            ))}
            {totalsRow && (
              <tr className="bg-rekker-surface/60 font-mono font-semibold">
                {totalsRow.map((v, j) => (
                  <td key={j} className="px-3 py-2 text-xs text-primary">
                    {typeof v === 'number' ? fmt(v) : v}
                  </td>
                ))}
              </tr>
            )}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} className="text-center py-10 text-muted-foreground text-sm">No records match filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── LPO Report ───────────────────────────────────────────────────────────────
function LPOReport({ filters }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [groupBy, setGroupBy] = useState('none'); // none | branch | day | branchDay

  useEffect(() => {
    setLoading(true);
    api.get('/lpos', { params: filters }).then((r) => setGroups(r.data || []))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);

  const flat = useMemo(() => {
    const out = [];
    groups.forEach((g) => g.lpos.forEach((l) => {
      const branch = l.branch?.name || l.branchNameRaw || '—';
      if (filters.branches?.length && (!l.branch || !filters.branches.includes(l.branch._id))) return;
      out.push({ date: g.date, branch, lpo: l });
    }));
    return out;
  }, [groups, filters.branches]);

  const rows = useMemo(() => {
    if (groupBy === 'none') {
      return flat.map((r) => [r.date, r.lpo.lpoNumber, r.branch, r.lpo.responsiblePerson?.name || '—',
        r.lpo.amount ?? '', r.lpo.status, r.lpo.errors?.filter((e) => e !== 'none').join(', ') || '—']);
    }
    const keyFn = groupBy === 'branch' ? (r) => r.branch
      : groupBy === 'day' ? (r) => r.date
      : (r) => `${r.date} · ${r.branch}`;
    const map = new Map();
    flat.forEach((r) => {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, { key: k, count: 0, amount: 0 });
      const g = map.get(k);
      g.count += 1;
      g.amount += Number(r.lpo.amount || 0);
    });
    return Array.from(map.values()).map((g) => [g.key, g.count, g.amount]);
  }, [flat, groupBy]);

  const cols = groupBy === 'none'
    ? ['Date', 'LPO #', 'Branch', 'Prepared By', 'Amount (KES)', 'Status', 'Errors']
    : [groupBy === 'branch' ? 'Branch' : groupBy === 'day' ? 'Day' : 'Day · Branch', 'LPOs', 'Total Amount'];
  const totals = groupBy === 'none'
    ? ['TOTAL', '', '', '', 'sum', '', '']
    : ['TOTAL', 'sum', 'sum'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Group by</span>
        {['none', 'branch', 'day', 'branchDay'].map((k) => (
          <button key={k} onClick={() => setGroupBy(k)}
            className={`text-xs px-2 py-1 rounded-md border ${groupBy === k ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
            {k === 'none' ? 'Detail' : k === 'branchDay' ? 'Branch × Day' : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        : <ReportTable cols={cols} rows={rows} totalsReducers={totals} title="LPO Report" filename="rekker-lpo-report" />}
    </div>
  );
}

// ── Invoice Report ───────────────────────────────────────────────────────────
function InvoiceReport({ filters }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [groupBy, setGroupBy] = useState('none');

  useEffect(() => {
    setLoading(true);
    const params = { ...filters };
    if (filters.branches?.length) params.branch = filters.branches.join(',');
    api.get('/invoices', { params }).then((r) => setGroups(r.data || []))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);

  const flat = useMemo(() => {
    const out = [];
    groups.forEach((g) => g.invoices.forEach((inv) => {
      out.push({ date: g.date, branch: inv.branch?.name || inv.branchNameRaw || '—', inv });
    }));
    return out;
  }, [groups]);

  const rows = useMemo(() => {
    if (groupBy === 'none') {
      return flat.map((r) => {
        const adj = (r.inv.adjustments || []).reduce((s, a) => s + Number(a.amount || 0), 0);
        return [
          r.date, r.inv.invoiceNumber, r.inv.lpoNumber || '—', r.branch,
          Number(r.inv.amountExVat || 0), Number(r.inv.amountInclVat || 0),
          r.inv.disparityAmount ?? '', r.inv.disparityReason || '—',
          adj || '', Number(r.inv.adjustedAmount ?? r.inv.amountInclVat), r.inv.status,
        ];
      });
    }
    const keyFn = groupBy === 'branch' ? (r) => r.branch
      : groupBy === 'day' ? (r) => r.date
      : (r) => `${r.date} · ${r.branch}`;
    const map = new Map();
    flat.forEach((r) => {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, { key: k, count: 0, exVat: 0, inclVat: 0, adj: 0 });
      const g = map.get(k);
      g.count += 1;
      g.exVat += Number(r.inv.amountExVat || 0);
      g.inclVat += Number(r.inv.amountInclVat || 0);
      g.adj += (r.inv.adjustments || []).reduce((s, a) => s + Number(a.amount || 0), 0);
    });
    return Array.from(map.values()).map((g) => [g.key, g.count, g.exVat, g.inclVat, g.adj, g.inclVat - g.adj]);
  }, [flat, groupBy]);

  const cols = groupBy === 'none'
    ? ['Date', 'Invoice #', 'LPO #', 'Branch', 'Ex-VAT', 'Incl. VAT', 'Disparity', 'Reason', 'Adjustments', 'Adjusted', 'Status']
    : [groupBy === 'branch' ? 'Branch' : groupBy === 'day' ? 'Day' : 'Day · Branch', 'Invoices', 'Ex-VAT', 'Incl. VAT', 'Adjustments', 'Adjusted'];
  const totals = groupBy === 'none'
    ? ['TOTAL', '', '', '', 'sum', 'sum', 'sum', '', 'sum', 'sum', '']
    : ['TOTAL', 'sum', 'sum', 'sum', 'sum', 'sum'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Group by</span>
        {['none', 'branch', 'day', 'branchDay'].map((k) => (
          <button key={k} onClick={() => setGroupBy(k)}
            className={`text-xs px-2 py-1 rounded-md border ${groupBy === k ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
            {k === 'none' ? 'Detail' : k === 'branchDay' ? 'Branch × Day' : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        : <ReportTable cols={cols} rows={rows} totalsReducers={totals} title="Invoice Report" filename="rekker-invoice-report" />}
    </div>
  );
}

// ── Goods Return Report ──────────────────────────────────────────────────────
function GoodsReturnReport({ filters }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    setLoading(true);
    const params = { ...filters };
    if (filters.branches?.length) params.branch = filters.branches.join(',');
    api.get('/invoices', { params }).then((r) => setGroups(r.data || []))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);

  const rows = useMemo(() => {
    const out = [];
    groups.forEach((g) => g.invoices.forEach((inv) => {
      (inv.adjustments || []).forEach((a) => {
        out.push([
          g.date, inv.invoiceNumber,
          inv.branch?.name || inv.branchNameRaw || '—',
          Number(a.amount), ADJ_LABELS[a.type] || a.type,
          a.reason || '—',
          Number(inv.adjustedAmount ?? inv.amountInclVat),
        ]);
      });
    }));
    return out;
  }, [groups]);

  const cols = ['Date', 'Invoice #', 'Branch', 'Adjustment Amount', 'Type', 'Reason', 'Adjusted Invoice'];
  const totals = ['TOTAL', '', '', 'sum', '', '', 'sum'];

  return loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
    : <ReportTable cols={cols} rows={rows} totalsReducers={totals} title="Goods Return Report" filename="rekker-returns-report" />;
}

// ── Disparity Product Report ─────────────────────────────────────────────────
function DisparityProductReport({ filters }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    setLoading(true);
    const params = { ...filters };
    if (filters.branches?.length) params.branch = filters.branches.join(',');
    api.get('/invoices', { params }).then((r) => setGroups(r.data || []))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);

  const rows = useMemo(() => {
    const out = [];
    groups.forEach((g) => g.invoices.forEach((inv) => {
      const lpoItems = inv.lpo?.items || [];
      const invItems = inv.items || [];
      if (!lpoItems.length && !invItems.length) return;
      const keyOf = (it) => (it.sku || it.name || '').toLowerCase().trim();
      const byKey = new Map();
      lpoItems.forEach((it) => byKey.set(keyOf(it), { name: it.name, lpo: it, inv: null }));
      invItems.forEach((it) => {
        const k = keyOf(it);
        if (byKey.has(k)) byKey.get(k).inv = it;
        else byKey.set(k, { name: it.name, lpo: null, inv: it });
      });
      byKey.forEach(({ name, lpo, inv: iv }) => {
        const lpoQty = Number(lpo?.quantity || 0);
        const invQty = Number(iv?.quantity || 0);
        const price  = Number(iv?.unitPrice ?? lpo?.unitPrice ?? 0);
        const dQty   = invQty - lpoQty;
        const dVal   = dQty * price;
        if (Math.abs(dQty) > 0.001 || Math.abs(dVal) > 0.01) {
          out.push([g.date, inv.invoiceNumber, inv.lpoNumber || '—', name, lpoQty, invQty, dQty, price, dVal]);
        }
      });
    }));
    return out;
  }, [groups]);

  const cols = ['Date', 'Invoice #', 'LPO #', 'Product', 'LPO Qty', 'Inv Qty', 'Δ Qty', 'Unit Price', 'Δ Value'];
  const totals = ['TOTAL', '', '', '', 'sum', 'sum', 'sum', '', 'sum'];

  return (
    <div className="space-y-3">
      {rows.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground p-3 rounded-md border border-dashed border-border">
          No line-level disparities found. This report needs LPOs and invoices with product line items
          (add them via Edit LPO / Edit Invoice → items).
        </p>
      )}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        : <ReportTable cols={cols} rows={rows} totalsReducers={totals} title="Disparity Product Report" filename="rekker-disparity-products" />}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [filters, setFilters] = useState({ startDate: '', endDate: '', branches: [] });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            LPOs, invoices, returns and product-level disparity — export to PDF or Excel.
          </p>
        </div>
      </div>

      <UniversalFilterBar value={filters} onChange={setFilters} />

      <Tabs defaultValue="lpo">
        <TabsList>
          <TabsTrigger value="lpo"><FileText className="w-3.5 h-3.5 mr-1.5" />LPOs</TabsTrigger>
          <TabsTrigger value="invoice"><Receipt className="w-3.5 h-3.5 mr-1.5" />Invoices</TabsTrigger>
          <TabsTrigger value="returns"><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Returns / Adjustments</TabsTrigger>
          <TabsTrigger value="disparity"><Layers className="w-3.5 h-3.5 mr-1.5" />Disparity Products</TabsTrigger>
        </TabsList>
        <TabsContent value="lpo"><LPOReport filters={filters} /></TabsContent>
        <TabsContent value="invoice"><InvoiceReport filters={filters} /></TabsContent>
        <TabsContent value="returns"><GoodsReturnReport filters={filters} /></TabsContent>
        <TabsContent value="disparity"><DisparityProductReport filters={filters} /></TabsContent>
      </Tabs>
    </div>
  );
}
