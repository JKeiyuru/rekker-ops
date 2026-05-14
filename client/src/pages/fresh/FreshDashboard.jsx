// client/src/pages/fresh/FreshDashboard.jsx
// Live operational command centre for fresh produce admins/team leads.
// Auto-refreshes every 30s. Shows live fleet, today's summary, and quick insights.

import { useEffect, useState, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import {
  Truck, Clock, AlertTriangle, CheckCircle2, RefreshCw, Loader2,
  MapPin, Users, Route, TrendingUp, Play, CircleDot, Timer,
  BarChart2, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import LiveDashboardTable from '@/components/fresh/LiveDashboardTable';
import RouteTimeline from '@/components/fresh/RouteTimeline';
import api from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const durLabel = m => {
  if (m == null || m === 0) return '0m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const DELAY_LABELS = {
  traffic:          'Traffic',
  supplier_delay:   'Supplier Delay',
  loading_delay:    'Loading Delay',
  vehicle_issue:    'Vehicle Issue',
  rain:             'Rain',
  breakdown:        'Breakdown',
  waiting_approval: 'Waiting Approval',
  other:            'Other',
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'text-primary', bg = 'bg-primary/10', pulse = false }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3 animate-fade-up">
      <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0 relative', bg)}>
        <Icon className={cn('w-4 h-4', color)} />
        {pulse && (
          <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
        <p className="text-2xl font-display tracking-wider text-foreground mt-1 leading-none">{value ?? '—'}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Live elapsed timer ────────────────────────────────────────────────────────
function useElapsed(startTime) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!startTime) return;
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(startTime)) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, [startTime]);
  return elapsed;
}

// ── Active trip card ──────────────────────────────────────────────────────────
function ActiveTripCard({ session }) {
  const elapsed   = useElapsed(session.dayStartTime);
  const [open, setOpen] = useState(false);
  const stages    = session.stages || [];
  const completed = stages.filter(s => s.status === 'completed').length;
  const hasDelay  = (session.totalDelayMinutes || 0) > 0;

  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/20 transition-colors text-left"
      >
        {/* Status dot */}
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />

        {/* Vehicle + driver */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-primary text-sm">{session.vehicle?.regNumber}</span>
            <span className="text-sm text-foreground">{session.driver?.fullName}</span>
            {session.helpers?.length > 0 && (
              <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-0.5">
                <Users className="w-3 h-3" />+{session.helpers.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-[11px] font-mono text-foreground">
              <MapPin className="w-3 h-3 text-primary" />
              {session.currentLocation || '—'}
            </span>
            <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
              <Timer className="w-3 h-3" />{elapsed}
            </span>
            <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
              <Route className="w-3 h-3" />{completed}/{stages.length} stages
            </span>
            {hasDelay && (
              <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{durLabel(session.totalDelayMinutes)}
              </span>
            )}
          </div>
        </div>

        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && stages.length > 0 && (
        <div className="px-4 pb-4 pt-2 border-t border-rekker-border/50 bg-background/40">
          <RouteTimeline stages={stages} compact />
        </div>
      )}
    </div>
  );
}

// ── Today summary ring ─────────────────────────────────────────────────────────
function CompletionRing({ completed, total }) {
  const pct    = total > 0 ? Math.round((completed / total) * 100) : 0;
  const r      = 28;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(220 17% 18%)" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r}
          fill="none"
          stroke={pct === 100 ? 'hsl(142 76% 36%)' : 'hsl(22 100% 58%)'}
          strokeWidth="6"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="36" y="40" textAnchor="middle" className="fill-foreground"
          style={{ fontSize: 14, fontFamily: 'Bebas Neue', letterSpacing: 1 }}>
          {pct}%
        </text>
      </svg>
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        {completed}/{total} done
      </p>
    </div>
  );
}

// ── Mini horizontal bar ───────────────────────────────────────────────────────
function InlineBar({ label, value, max, color = 'bg-primary', sub }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground">{label}</span>
        {sub && <span className="text-[11px] font-mono text-muted-foreground">{sub}</span>}
      </div>
      <div className="h-1.5 bg-accent/40 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FreshDashboard() {
  const today = format(new Date(), 'yyyy-MM-dd');

  const [liveSessions, setLiveSessions]   = useState([]);
  const [todaySummary, setTodaySummary]   = useState(null);
  const [weekSummary,  setWeekSummary]    = useState(null);
  const [loading,      setLoading]        = useState(true);
  const [refreshing,   setRefreshing]     = useState(false);
  const [lastRefresh,  setLastRefresh]    = useState(null);

  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const weekStart = format(subDays(new Date(), 6), 'yyyy-MM-dd');

      const [liveRes, todayRes, weekRes] = await Promise.all([
        api.get('/trips/live'),
        api.get('/trips/reports/summary', { params: { start: today, end: today } }),
        api.get('/trips/reports/summary', { params: { start: weekStart, end: today } }),
      ]);

      setLiveSessions(liveRes.data || []);
      setTodaySummary(todayRes.data);
      setWeekSummary(weekRes.data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(() => fetchAll(true), 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  // Delay breakdown for today
  const todayDelays = todaySummary?.delayBreakdown
    ? Object.entries(todaySummary.delayBreakdown)
        .map(([cat, v]) => ({ label: DELAY_LABELS[cat] || cat, ...v }))
        .sort((a, b) => b.count - a.count)
    : [];

  const maxDelayCount = Math.max(...todayDelays.map(d => d.count), 1);

  // Top locations for this week
  const weekLocations = weekSummary?.topLocations || [];
  const maxLocCount   = Math.max(...weekLocations.map(l => l.count), 1);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Fresh Produce</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(), 'EEEE dd MMM yyyy')}
            {lastRefresh && (
              <span className="ml-3 text-xs font-mono text-muted-foreground/60">
                · updated {format(lastRefresh, 'HH:mm:ss')}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchAll(true)} disabled={refreshing}>
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Truck}
          label="Active Trips"
          value={todaySummary?.activeSessions ?? 0}
          sub={liveSessions.length > 0 ? 'fleet is out' : 'no vehicles moving'}
          pulse={liveSessions.length > 0}
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed Today"
          value={todaySummary?.completedSessions ?? 0}
          sub={`of ${todaySummary?.totalSessions ?? 0} total`}
          color="text-emerald-400" bg="bg-emerald-500/10"
        />
        <StatCard
          icon={AlertTriangle}
          label="Delay Today"
          value={durLabel(todaySummary?.totalDelayMinutes)}
          sub={todayDelays.length > 0 ? `${todayDelays.length} categories` : 'no delays'}
          color="text-amber-400" bg="bg-amber-500/10"
        />
        <StatCard
          icon={Route}
          label="Stages Logged"
          value={todaySummary?.completedStages ?? 0}
          sub={`avg ${durLabel(todaySummary?.avgStageDuration)} each`}
          color="text-blue-400" bg="bg-blue-500/10"
        />
      </div>

      {/* Two-column layout: live fleet + today insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Live fleet — takes 2/3 width */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Live — {liveSessions.length} active vehicle{liveSessions.length !== 1 ? 's' : ''}
            </p>
          </div>

          {liveSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Truck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No active trips right now.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Field staff can start their day from the Field Ops page.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {liveSessions.map(s => (
                <ActiveTripCard key={s._id} session={s} />
              ))}
            </div>
          )}
        </div>

        {/* Today insights — 1/3 width */}
        <div className="space-y-4">

          {/* Completion ring */}
          {(todaySummary?.totalSessions ?? 0) > 0 && (
            <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-center gap-4">
              <CompletionRing
                completed={todaySummary?.completedSessions ?? 0}
                total={todaySummary?.totalSessions ?? 0}
              />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Today's Progress</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-mono text-emerald-400">{todaySummary?.completedSessions}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Active</span>
                    <span className="font-mono text-primary">{todaySummary?.activeSessions}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Avg Duration</span>
                    <span className="font-mono text-foreground">{durLabel(todaySummary?.avgDurationMinutes)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Delay breakdown */}
          {todayDelays.length > 0 && (
            <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 space-y-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Today's Delays
              </p>
              {todayDelays.map((d, i) => (
                <InlineBar
                  key={i}
                  label={d.label}
                  value={d.count}
                  max={maxDelayCount}
                  color="bg-amber-500/70"
                  sub={d.totalMin > 0 ? durLabel(d.totalMin) : `${d.count}×`}
                />
              ))}
            </div>
          )}

          {/* 7-day top locations */}
          {weekLocations.length > 0 && (
            <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 space-y-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary" />
                Top Locations (7 days)
              </p>
              {weekLocations.map((l, i) => (
                <InlineBar
                  key={i}
                  label={l.location}
                  value={l.count}
                  max={maxLocCount}
                  color="bg-primary/70"
                  sub={`${l.count} visits`}
                />
              ))}
            </div>
          )}

          {/* 7-day vehicle snapshot */}
          {weekSummary?.vehicleStats?.length > 0 && (
            <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 space-y-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BarChart2 className="w-3 h-3 text-blue-400" />
                Vehicle Utilisation (7 days)
              </p>
              {weekSummary.vehicleStats.slice(0, 4).map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground w-20 truncate shrink-0">{v.reg}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-accent/40 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500/70 rounded-full"
                        style={{ width: `${(v.trips / Math.max(...weekSummary.vehicleStats.map(x => x.trips), 1)) * 100}%` }} />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground w-8 text-right shrink-0">{v.trips}t</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full live table (for wider views / more detail) */}
      {liveSessions.length > 0 && (
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Detailed Fleet View</p>
          <LiveDashboardTable sessions={liveSessions} />
        </div>
      )}

      {/* 7-day driver leaderboard */}
      {weekSummary?.driverStats?.length > 0 && (
        <div className="rounded-xl border border-rekker-border bg-rekker-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-rekker-border flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">Driver Performance — Last 7 Days</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rekker-border bg-rekker-surface/80">
                {['#', 'Driver', 'Trips', 'Completed', 'Total Hours', 'Delay'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekSummary.driverStats.slice(0, 6).map((d, i) => (
                <tr key={i} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                  <td className="px-5 py-3">
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono',
                      i === 0 ? 'bg-amber-500/20 text-amber-400'
                        : i === 1 ? 'bg-slate-400/20 text-slate-400'
                        : i === 2 ? 'bg-orange-700/20 text-orange-700'
                        : 'bg-accent text-muted-foreground'
                    )}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {d.name.charAt(0)}
                      </div>
                      <span className="font-medium text-foreground">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-semibold text-foreground">{d.trips}</td>
                  <td className="px-5 py-3">
                    <span className="text-emerald-400 font-mono">{d.completed}</span>
                    <span className="text-muted-foreground text-xs ml-1">/ {d.trips}</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-foreground">
                    {d.totalMin > 0 ? `${(d.totalMin / 60).toFixed(1)}h` : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn('font-mono text-sm', d.delays > 0 ? 'text-amber-400' : 'text-muted-foreground/40')}>
                      {d.delays > 0 ? durLabel(d.delays) : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}