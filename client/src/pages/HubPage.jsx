// client/src/pages/HubPage.jsx
// Super-admin / admin landing hub: module tiles + live overview KPIs.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Factory, Truck, MapPin, Leaf, Package, Settings, ArrowRight,
  Activity, AlertTriangle, TrendingUp, FileText, Layers,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { format } from 'date-fns';

const ADMIN = ['super_admin', 'admin'];

const MODULES = [
  {
    key: 'packaging', label: 'Packaging', desc: 'LPOs, invoices, packing workflow',
    to: '/dashboard', icon: Package, tone: 'from-blue-500/20 to-blue-500/0', iconBg: 'bg-blue-500/15 text-blue-400',
    roles: ['super_admin','admin','team_lead','packaging_team_lead','viewer'],
  },
  {
    key: 'deliveries', label: 'Deliveries', desc: 'Goods drivers, trips, stops',
    to: '/deliveries', icon: Truck, tone: 'from-cyan-500/20 to-cyan-500/0', iconBg: 'bg-cyan-500/15 text-cyan-400',
    roles: ['super_admin','admin','team_lead','packaging_team_lead'],
  },
  {
    key: 'merchandising', label: 'Merchandising', desc: 'Check-ins, assignments, attendance',
    to: '/checkin', icon: MapPin, tone: 'from-purple-500/20 to-purple-500/0', iconBg: 'bg-purple-500/15 text-purple-400',
    roles: ['super_admin','admin','team_lead','merchandising_team_lead'],
  },
  {
    key: 'fresh', label: 'Fresh Produce', desc: 'Sourcing, customer LPOs, returns',
    to: '/fresh', icon: Leaf, tone: 'from-emerald-500/20 to-emerald-500/0', iconBg: 'bg-emerald-500/15 text-emerald-400',
    roles: ['super_admin','admin','team_lead','fresh_team_lead'],
  },
  {
    key: 'manufacturing', label: 'Manufacturing', desc: 'BOM, production, costs, stock',
    to: '/manufacturing', icon: Factory, tone: 'from-orange-500/20 to-orange-500/0', iconBg: 'bg-orange-500/15 text-orange-400',
    roles: ['super_admin','admin','production_manager'],
  },
  {
    key: 'admin', label: 'Admin', desc: 'Users, persons, branches',
    to: '/users', icon: Settings, tone: 'from-slate-500/20 to-slate-500/0', iconBg: 'bg-slate-500/15 text-slate-300',
    roles: ['super_admin','admin'],
  },
];

export default function HubPage() {
  const { user } = useAuthStore();
  const isAdmin = ADMIN.includes(user?.role);
  const [packaging, setPackaging]   = useState(null);
  const [mfg, setMfg]               = useState(null);
  const [branchesPending, setBP]    = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.allSettled([
      api.get('/reports/summary'),
      api.get('/mfg/dashboard'),
      api.get('/branches/pending-count'),
    ]).then(([a, b, c]) => {
      if (a.status === 'fulfilled') setPackaging(a.value.data);
      if (b.status === 'fulfilled') setMfg(b.value.data);
      if (c.status === 'fulfilled') setBP(c.value.data?.count || 0);
    });
  }, [isAdmin]);

  const visible = MODULES.filter(m => m.roles.includes(user?.role));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
          {format(new Date(), 'EEEE, dd MMMM yyyy')}
        </p>
        <h1 className="page-title">Operations Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome, <span className="text-foreground font-medium">{user?.fullName}</span> — jump into a module or scan the overview.
        </p>
      </div>

      {/* Live overview KPIs */}
      {isAdmin && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider font-mono">Live overview</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat icon={FileText}    label="LPOs today"        value={packaging?.today?.total ?? '—'}
              sub={packaging ? `${packaging.today?.checked || 0} checked` : ''} tone="text-blue-400" />
            <MiniStat icon={AlertTriangle} label="LPO errors today" value={packaging?.today?.withErrors ?? '—'} tone="text-red-400" />
            <MiniStat icon={Factory}     label="Running cycles"    value={mfg?.kpis?.runningCycles ?? '—'}
              sub={mfg ? `${Number(mfg.kpis?.unitsToday || 0).toLocaleString()} units today` : ''} tone="text-orange-400" />
            <MiniStat icon={Layers}      label="Low-stock materials" value={mfg?.kpis?.lowStockCount ?? '—'} tone="text-amber-400" />
          </div>
          {branchesPending > 0 && (
            <p className="text-xs text-amber-400 mt-2 font-mono">
              ⚠ {branchesPending} branch{branchesPending === 1 ? '' : 'es'} awaiting approval —{' '}
              <Link to="/branches" className="underline">review</Link>
            </p>
          )}
        </section>
      )}

      {/* Module tiles */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider font-mono">Modules</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((m) => (
            <Link key={m.key} to={m.to}
              className={`group relative overflow-hidden rounded-2xl border border-rekker-border bg-gradient-to-br ${m.tone} bg-rekker-surface p-5 hover:border-primary/50 transition-all`}>
              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${m.iconBg}`}>
                  <m.icon className="w-6 h-6" strokeWidth={2} />
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
              <p className="mt-4 text-lg font-semibold text-foreground">{m.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
              <ModuleMicroStat moduleKey={m.key} packaging={packaging} mfg={mfg} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, sub, tone = 'text-primary' }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
        <Icon className={`w-3.5 h-3.5 ${tone}`} />
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ModuleMicroStat({ moduleKey, packaging, mfg }) {
  let text = null;
  if (moduleKey === 'packaging' && packaging) text = `${packaging.today?.total || 0} LPOs today · ${packaging.today?.checked || 0} checked`;
  if (moduleKey === 'manufacturing' && mfg)   text = `${mfg.kpis?.runningCycles || 0} runs · ${mfg.kpis?.lowStockCount || 0} low stock`;
  if (!text) return null;
  return <p className="mt-3 text-[10px] font-mono text-muted-foreground border-t border-rekker-border pt-2">{text}</p>;
}
