// client/src/pages/manufacturing/ManufacturingDashboard.jsx

import { useEffect, useState, useMemo } from 'react';
import { Factory, Boxes, Beaker, Building2, BarChart3, Play, CheckCircle2, AlertTriangle, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { format, isToday } from 'date-fns';

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
  const [stats, setStats]       = useState({ products: 0, materials: 0, suppliers: 0, cycles: 0 });
  const [cycles, setCycles]     = useState([]);
  const [products, setProducts] = useState([]);
  const [audit, setAudit]       = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/products'),
      api.get('/materials'),
      api.get('/material-suppliers'),
      api.get('/production-cycles'),
      api.get('/materials/audit/all?limit=8').catch(() => ({ data: [] })),
    ]).then(([p, m, s, c, a]) => {
      setStats({
        products: (p.data || []).length,
        materials: (m.data || []).length,
        suppliers: (s.data || []).length,
        cycles: (c.data || []).length,
      });
      setCycles(c.data || []);
      setProducts((p.data || []).slice(0, 8));
      setAudit(a.data || []);
    });
  }, []);

  const summary = useMemo(() => {
    const running   = cycles.filter((c) => c.status === 'running').length;
    const completed = cycles.filter((c) => c.status === 'completed').length;
    const todays    = cycles.filter((c) => c.startedAt && isToday(new Date(c.startedAt)));
    const unitsToday = todays.reduce((s, c) => s + Number(c.unitsProduced || 0), 0);
    const costToday  = todays.reduce((s, c) => s + Number(c.totalCost     || 0), 0);
    return { running, completed, unitsToday, costToday };
  }, [cycles]);

  const recentCycles = cycles.slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><Factory className="w-6 h-6 text-primary" /> Manufacturing</h1>
        <p className="text-sm text-muted-foreground mt-1">Costing, production cycles, and product management.</p>
      </div>

      {/* Catalogue KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <KPI icon={Boxes}     label="Products"  value={stats.products}  to="/manufacturing/products" />
        <KPI icon={Beaker}    label="Materials" value={stats.materials} to="/manufacturing/materials" />
        <KPI icon={Building2} label="Suppliers" value={stats.suppliers} to="/manufacturing/suppliers" />
        <KPI icon={BarChart3} label="Cycles"    value={stats.cycles}    to="/manufacturing/cycles" />
      </div>

      {/* Operational status summary */}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Today &amp; status</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KPI icon={Play}          tone="text-amber-500"   label="Running now"     value={summary.running}    to="/manufacturing/cycles" />
          <KPI icon={CheckCircle2}  tone="text-emerald-500" label="Completed total" value={summary.completed}  to="/manufacturing/cycles" />
          <KPI icon={BarChart3}     tone="text-primary"     label="Units today"     value={summary.unitsToday} to="/manufacturing/cycles" />
          <KPI icon={Factory}       tone="text-primary"     label="Cost today"      value={`KES ${summary.costToday.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} to="/manufacturing/cycles" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 sm:p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Products &amp; costs</p>
          {products.length === 0 ? <p className="text-sm text-muted-foreground">No products yet.</p> : (
            <ul className="divide-y divide-rekker-border">
              {products.map((p) => (
                <li key={p._id} className="py-2 flex items-center justify-between text-sm gap-2">
                  <Link to={`/manufacturing/products/${p._id}`} className="hover:text-primary truncate min-w-0">
                    {p.name} <span className="text-xs text-muted-foreground">{p.volume}</span>
                  </Link>
                  <span className="font-mono text-primary shrink-0 text-xs sm:text-sm">KES {Number(p.currentUnitCost || 0).toFixed(2)}/unit</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 sm:p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Recent cycles</p>
          {recentCycles.length === 0 ? <p className="text-sm text-muted-foreground">No cycles yet.</p> : (
            <ul className="divide-y divide-rekker-border">
              {recentCycles.map((c) => (
                <li key={c._id} className="py-2 flex items-center justify-between text-sm gap-2">
                  <span className="truncate min-w-0">{c.product?.name || '—'} <span className="text-[10px] text-muted-foreground font-mono">{c.cycleNumber}</span></span>
                  <span className="text-[10px] sm:text-xs font-mono text-muted-foreground shrink-0">{format(new Date(c.startedAt), 'dd/MM HH:mm')} · {c.unitsProduced}u</span>
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
            {audit.slice(0, 6).map((i) => {
              const delta = Number(i.deltaPct || 0);
              const tone  = delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-500' : 'text-muted-foreground';
              return (
                <li key={i._id} className="py-2 flex items-center justify-between text-sm gap-2">
                  <span className="truncate min-w-0 flex items-center gap-1.5">
                    {delta !== 0 && <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${tone}`} />}
                    {i.material?.name || '—'}
                    <span className="text-[10px] text-muted-foreground font-mono">→ KES {Number(i.unitPrice).toFixed(2)}</span>
                  </span>
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
