// client/src/pages/manufacturing/CostAuditPage.jsx
// Read-only audit log of every material cost change across the company.

import { useEffect, useState, useMemo } from 'react';
import { History, TrendingUp, TrendingDown, Minus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { format } from 'date-fns';

export default function CostAuditPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/materials/audit/all')
      .then((r) => setItems(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) =>
      (i.material?.name || '').toLowerCase().includes(t) ||
      (i.supplier?.name || '').toLowerCase().includes(t) ||
      (i.reason || '').toLowerCase().includes(t) ||
      (i.changedBy?.fullName || '').toLowerCase().includes(t)
    );
  }, [q, items]);

  const summary = useMemo(() => {
    const total = items.length;
    const ups = items.filter((i) => (i.deltaPct || 0) > 0).length;
    const downs = items.filter((i) => (i.deltaPct || 0) < 0).length;
    const flat = total - ups - downs;
    return { total, ups, downs, flat };
  }, [items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><History className="w-6 h-6 text-primary" /> Cost Change Audit</h1>
        <p className="text-sm text-muted-foreground mt-1">Every material price change, who made it, and the impact.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total changes', value: summary.total },
          { label: 'Increases',     value: summary.ups,   tone: 'text-red-500' },
          { label: 'Decreases',     value: summary.downs, tone: 'text-emerald-500' },
          { label: 'Unchanged',     value: summary.flat,  tone: 'text-muted-foreground' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{k.label}</p>
            <p className={`text-2xl font-bold mt-2 ${k.tone || ''}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Filter by material, supplier, user…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl border-rekker-border">
          <p className="text-sm text-muted-foreground">No price changes recorded yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-rekker-surface">
              <tr>{['When','Material','Supplier','From','To','Change','Reason','By'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const delta = Number(i.deltaPct || 0);
                const Icon  = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
                const tone  = delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-500' : 'text-muted-foreground';
                return (
                  <tr key={i._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {format(new Date(i.effectiveFrom || i.createdAt), 'dd MMM yyyy HH:mm')}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{i.material?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{i.supplier?.name || '—'}</td>
                    <td className="px-4 py-2.5 font-mono">{i.previousPrice != null ? `KES ${Number(i.previousPrice).toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-primary">KES {Number(i.unitPrice).toFixed(2)}</td>
                    <td className={`px-4 py-2.5 font-mono ${tone}`}>
                      <span className="inline-flex items-center gap-1"><Icon className="w-3.5 h-3.5" />{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate" title={i.reason}>{i.reason || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{i.changedBy?.fullName || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
