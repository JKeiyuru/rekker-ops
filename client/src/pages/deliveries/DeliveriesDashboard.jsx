// client/src/pages/deliveries/DeliveriesDashboard.jsx
// Live + analytical dashboard for ordinary-goods deliveries.

import { useEffect, useState } from 'react';
import { Truck, Loader2, Users, Activity, Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

function KPI({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold mt-1.5 ${accent ? 'text-primary' : ''}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DeliveriesDashboard() {
  const [live, setLive] = useState([]);
  const [today, setToday] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [team, setTeam] = useState({ merchandisers: [], tripHelpers: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const t = new Date().toISOString().split('T')[0];
    const [a, b, an, tm] = await Promise.all([
      api.get('/packaging-trips/live'),
      api.get('/packaging-trips', { params: { date: t } }),
      api.get('/packaging-trips/analytics', { params: { days: 7 } }).catch(() => ({ data: null })),
      api.get('/packaging-trips/team').catch(() => ({ data: { merchandisers: [], tripHelpers: [] } })),
    ]);
    setLive(a.data || []);
    setToday(b.data || []);
    setAnalytics(an.data);
    setTeam(tm.data || { merchandisers: [], tripHelpers: [] });
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const completedToday = today.filter((s) => s.status === 'completed').length;
  const avgDur = analytics?.avgDurationMin || 0;
  const totalDelay = analytics?.totalDelayMin || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><Truck className="w-6 h-6 text-primary" /> Deliveries</h1>
        <p className="text-sm text-muted-foreground mt-1">Live tracking, analytics and team visibility for ordinary-goods deliveries.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Active now" value={live.length} accent />
        <KPI label="Today total" value={today.length} />
        <KPI label="Completed today" value={completedToday} />
        <KPI label="Avg duration (7d)" value={`${avgDur}m`} sub="completed trips" />
        <KPI label="Total stages (7d)" value={analytics?.totalStages || 0} />
        <KPI label="Delays (7d)" value={`${totalDelay}m`} sub={`${analytics?.totalTrips || 0} trips`} />
      </div>

      {/* Live trips */}
      <section>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> Live trips
        </h2>
        {live.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl"><p className="text-sm text-muted-foreground">No active deliveries.</p></div>
        ) : (
          <div className="rounded-xl border border-rekker-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-rekker-surface">
                <tr>{['Driver','Vehicle','Team','Location','Stage','Stages','Started','At location'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {live.map((s) => (
                  <tr key={s._id} className="border-t border-rekker-border/50">
                    <td className="px-4 py-2.5">{s.driver?.fullName}</td>
                    <td className="px-4 py-2.5 font-mono">{s.vehicle?.regNumber}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{(s.helpers || []).map(h => h.fullName).join(', ') || '—'}</td>
                    <td className="px-4 py-2.5">{s.currentLocation || '—'}</td>
                    <td className="px-4 py-2.5"><Badge variant={s.activeStage?.status === 'in_transit' ? 'warning' : 'default'}>{s.activeStage?.status || '—'}</Badge></td>
                    <td className="px-4 py-2.5 font-mono">{s.totalStages}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.dayStartTime ? formatDistanceToNow(new Date(s.dayStartTime), { addSuffix: true }) : '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.minutesAtCurrentLocation != null ? `${s.minutesAtCurrentLocation}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* By driver / vehicle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">By driver (7d)</h2>
          <div className="rounded-xl border border-rekker-border overflow-hidden">
            {(analytics?.byDriver || []).length === 0
              ? <div className="text-center py-8 text-xs text-muted-foreground">No trips yet.</div>
              : (
              <table className="w-full text-sm">
                <thead className="bg-rekker-surface">
                  <tr>{['Driver','Trips','Stages','Avg dur','Delay'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {analytics.byDriver.map((d, i) => (
                    <tr key={i} className="border-t border-rekker-border/50">
                      <td className="px-3 py-2">{d.name}</td>
                      <td className="px-3 py-2 font-mono">{d.trips}</td>
                      <td className="px-3 py-2 font-mono">{d.stages}</td>
                      <td className="px-3 py-2 font-mono">{d.trips ? Math.round(d.durationMin / d.trips) : 0}m</td>
                      <td className="px-3 py-2 font-mono text-amber-400">{d.delayMin}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">By vehicle (7d)</h2>
          <div className="rounded-xl border border-rekker-border overflow-hidden">
            {(analytics?.byVehicle || []).length === 0
              ? <div className="text-center py-8 text-xs text-muted-foreground">No trips yet.</div>
              : (
              <table className="w-full text-sm">
                <thead className="bg-rekker-surface">
                  <tr>{['Vehicle','Trips','Stages','Avg dur','Delay'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {analytics.byVehicle.map((v, i) => (
                    <tr key={i} className="border-t border-rekker-border/50">
                      <td className="px-3 py-2 font-mono">{v.reg}</td>
                      <td className="px-3 py-2 font-mono">{v.trips}</td>
                      <td className="px-3 py-2 font-mono">{v.stages}</td>
                      <td className="px-3 py-2 font-mono">{v.trips ? Math.round(v.durationMin / v.trips) : 0}m</td>
                      <td className="px-3 py-2 font-mono text-amber-400">{v.delayMin}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Team visibility */}
      <section>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" /> Team
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-rekker-border p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Merchandisers ({team.merchandisers.length})</p>
            {team.merchandisers.length === 0
              ? <p className="text-xs text-muted-foreground">No active merchandisers. Add users with role <code className="px-1 bg-accent rounded">merchandiser</code> in Users.</p>
              : (
              <ul className="space-y-1.5">
                {team.merchandisers.map((m) => (
                  <li key={m._id} className="flex items-center justify-between text-sm">
                    <span>{m.fullName}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">@{m.username}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-rekker-border p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Recent trip helpers (30d) ({team.tripHelpers.length})</p>
            {team.tripHelpers.length === 0
              ? <p className="text-xs text-muted-foreground">No trip helpers logged in the last 30 days.</p>
              : (
              <ul className="space-y-1.5">
                {team.tripHelpers.map((h) => (
                  <li key={h._id} className="flex items-center justify-between text-sm">
                    <span>{h.fullName} <span className="text-[10px] text-muted-foreground ml-1">{h.role}</span></span>
                    <span className="text-[10px] font-mono text-muted-foreground">last: {h.lastSeen}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Today summary */}
      <section>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">All today</h2>
        {today.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl"><p className="text-sm text-muted-foreground">No trips today.</p></div>
        ) : (
          <div className="rounded-xl border border-rekker-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-rekker-surface"><tr>{['Driver','Vehicle','Status','Stages','Duration','Started','Ended'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
              ))}</tr></thead>
              <tbody>
                {today.map((s) => (
                  <tr key={s._id} className="border-t border-rekker-border/50">
                    <td className="px-4 py-2.5">{s.driver?.fullName}</td>
                    <td className="px-4 py-2.5 font-mono">{s.vehicle?.regNumber}</td>
                    <td className="px-4 py-2.5"><Badge variant={s.status === 'completed' ? 'default' : 'warning'}>{s.status}</Badge></td>
                    <td className="px-4 py-2.5 font-mono">{s.totalStages}</td>
                    <td className="px-4 py-2.5 font-mono">{s.totalDurationMinutes != null ? `${s.totalDurationMinutes}m` : '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.dayStartTime ? format(new Date(s.dayStartTime), 'HH:mm') : '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.dayEndTime ? format(new Date(s.dayEndTime), 'HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
