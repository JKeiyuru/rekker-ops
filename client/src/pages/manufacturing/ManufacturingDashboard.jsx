// client/src/pages/manufacturing/ManufacturingDashboard.jsx

import { useEffect, useState } from 'react';
import { Factory, Boxes, Beaker, Building2, BarChart3, Play, AlertTriangle, History, TrendingUp, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';

const KPI = ({ icon: Icon, label, value, to, tone }) => (
  <Link to={to} className="rounded-xl border border-rekker-border bg-rekker-surface p-4 sm:p-5 hover:border-primary/50 transition-colors block">
    <div className="flex items-center justify-between">
      <p className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <Icon className={`w-4 h-4 ${tone || 'text-primary'}`} />
    </div>
    <p className="text-2xl sm:text-3xl font-bold mt-2 sm:mt-3">{value}</p>
  </Link>
);

export default function ManufacturingDashboard() {
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    api.get('/mfg/dashboard').then(r => setData(r.data)).catch(() => setData({ kpis: {}, lowStock: [], profitable: [] }));
    api.get('/materials/audit/all?limit=8').then(r => setAudit(r.data || [])).catch(() => setAudit([]));
  }, []);

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const k = data.kpis || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><Factory className="w-6 h-6 text-primary" /> Manufacturing</h1>
        <p className="text-sm text-muted-foreground mt-1">MRP — costing, stock, production, intelligence.</p>
      </div>

      {/* Catalogue KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <KPI icon={Boxes}      label="Products"  value={k.productsCount  || 0} to="/manufacturing/products" />
        <KPI icon={Beaker}     label="Materials" value={k.materialsCount || 0} to="/manufacturing/materials" />
        <KPI icon={AlertTriangle} tone="text-amber-500" label="Low stock" value={k.lowStockCount || 0} to="/manufacturing/purchase" />
        <KPI icon={Play}       tone="text-emerald-500" label="Running cycles" value={k.runningCycles || 0} to="/manufacturing/cycles" />
      </div>

      {/* Today / month */}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Output</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KPI icon={BarChart3} label="Units today"  value={Number(k.unitsToday || 0).toLocaleString()} to="/manufacturing/cycles" />
          <KPI icon={Factory}   label="Cost today"   value={`KES ${Number(k.costToday || 0).toLocaleString(undefined,{maximumFractionDigits:0})}`} to="/manufacturing/cycles" />
          <KPI icon={BarChart3} label="Units this month" value={Number(k.unitsMonth || 0).toLocaleString()} to="/manufacturing/cycles" />
          <KPI icon={Factory}   label="Cost this month"  value={`KES ${Number(k.costMonth || 0).toLocaleString(undefined,{maximumFractionDigits:0})}`} to="/manufacturing/cycles" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Low stock alerts */}
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Low-stock alerts</p>
            <Link to="/manufacturing/purchase" className="text-xs text-primary hover:underline inline-flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> Recommendations</Link>
          </div>
          {(data.lowStock || []).length === 0 ? <p className="text-sm text-muted-foreground">All materials above minimum.</p> : (
            <ul className="divide-y divide-rekker-border">
              {data.lowStock.slice(0, 8).map(m => (
                <li key={m._id} className="py-2 flex items-center justify-between text-sm gap-2">
                  <span className="truncate min-w-0">{m.name} {m.supplier && <span className="text-[10px] text-muted-foreground">· {m.supplier}</span>}</span>
                  <span className="font-mono text-xs shrink-0"><span className="text-amber-500">{Number(m.currentStock).toFixed(1)}</span> / {Number(m.minimumStock).toFixed(1)} {m.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top profitable products */}
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 sm:p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Most profitable products</p>
          {(data.profitable || []).length === 0 ? <p className="text-sm text-muted-foreground">Set selling prices to see margins.</p> : (
            <ul className="divide-y divide-rekker-border">
              {data.profitable.map((p, i) => (
                <li key={i} className="py-2 flex items-center justify-between text-sm gap-2">
                  <span className="truncate min-w-0">{p.name}</span>
                  <span className="font-mono shrink-0"><span className={p.marginPct < 0 ? 'text-red-500' : 'text-emerald-500'}>{p.marginPct.toFixed(1)}%</span> <span className="text-[10px] text-muted-foreground">KES {p.unitCost.toFixed(2)} → {p.sellExcl.toFixed(2)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2"><History className="w-3.5 h-3.5" /> Recent cost changes</p>
          <Link to="/manufacturing/audit" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {audit.length === 0 ? <p className="text-sm text-muted-foreground">No recent changes.</p> : (
          <ul className="divide-y divide-rekker-border">
            {audit.slice(0, 6).map(i => {
              const delta = Number(i.deltaPct || 0);
              const tone = delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-500' : 'text-muted-foreground';
              return (
                <li key={i._id} className="py-2 flex items-center justify-between text-sm gap-2">
                  <span className="truncate min-w-0">{i.material?.name || '—'} <span className="text-[10px] text-muted-foreground font-mono">→ KES {Number(i.unitPrice).toFixed(2)}</span></span>
                  <span className={`text-xs font-mono shrink-0 ${tone}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
