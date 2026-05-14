// client/src/pages/fresh/FreshReportsPage.jsx
// Full analytics dashboard: daily trends, delay breakdown, vehicle + driver stats, timeline view.

import { useEffect, useState, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import {
  Download, Loader2, Clock, Truck, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, CalendarDays, MapPin, Users, TrendingUp,
  BarChart2, RefreshCw, Route,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import RouteTimeline from '@/components/fresh/RouteTimeline';
import api from '@/lib/api';

// ── Helpers ────────────────────────────────────────────────────────────────────
const durLabel = m => {
  if (m == null) return '—';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const STATUS_CFG = {
  active:    { label: 'Active',     variant: 'default'     },
  completed: { label: 'Completed',  variant: 'success'     },
  cancelled: { label: 'Cancelled',  variant: 'destructive' },
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

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'text-primary', bg = 'bg-primary/10' }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3">
      <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', bg)}>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-display tracking-wider text-foreground mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Mini bar chart (pure CSS, no deps) ────────────────────────────────────────
function MiniBarChart({ data, valueKey, labelKey, colorClass = 'bg-primary', maxItems = 6 }) {
  const sliced = data.slice(0, maxItems);
  const maxVal = Math.max(...sliced.map(d => d[valueKey] || 0), 1);
  return (
    <div className="space-y-2">
      {sliced.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono w-24 truncate shrink-0">{d[labelKey]}</span>
          <div className="flex-1 h-5 bg-accent/40 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', colorClass)}
              style={{ width: `${Math.max(2, (d[valueKey] / maxVal) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-mono text-foreground w-10 text-right shrink-0">{d[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

// ── Daily trend sparkline ─────────────────────────────────────────────────────
function TrendSparkline({ data }) {
  if (!data?.length) return <p className="text-xs text-muted-foreground py-4 text-center">No data for period.</p>;

  const max = Math.max(...data.map(d => d.totalSessions), 1);
  const W = 600, H = 100;
  const points = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * W,
    y: H - (d.totalSessions / max) * (H - 10) - 5,
    ...d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(22 100% 58%)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(22 100% 58%)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#spark-fill)" />
        <path d={pathD} fill="none" stroke="hsl(22 100% 58%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="hsl(22 100% 58%)" />
        ))}
      </svg>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border">
              {['Date', 'Trips', 'Done', 'Avg Duration', 'Delay', 'Vehicles', 'Stages'].map(h => (
                <th key={h} className="text-left py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d, i) => (
              <tr key={i} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                <td className="py-2 px-2 text-foreground">{d.date}</td>
                <td className="py-2 px-2 font-semibold text-foreground">{d.totalSessions}</td>
                <td className="py-2 px-2 text-emerald-400">{d.completed}</td>
                <td className="py-2 px-2 text-foreground">{durLabel(d.avgDuration)}</td>
                <td className="py-2 px-2 text-amber-400">{durLabel(d.totalDelayMin)}</td>
                <td className="py-2 px-2 text-foreground">{d.vehicleCount}</td>
                <td className="py-2 px-2 text-foreground">{d.totalStages}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Session row with expandable timeline ──────────────────────────────────────
function SessionRow({ session }) {
  const [open, setOpen] = useState(false);
  const stages = session.stages || [];

  return (
    <div className="rounded-xl border border-rekker-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 bg-rekker-surface hover:bg-accent/20 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-foreground">{session.vehicle?.regNumber || '—'}</span>
            <span className="text-sm text-muted-foreground">— {session.driver?.fullName}</span>
            <Badge variant={STATUS_CFG[session.status]?.variant || 'pending'}>
              {STATUS_CFG[session.status]?.label || session.status}
            </Badge>
            {session.helpers?.length > 0 && (
              <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                <Users className="w-3 h-3" />+{session.helpers.length}
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">
            {session.date} ·{' '}
            {session.dayStartTime ? format(new Date(session.dayStartTime), 'HH:mm') : '—'}
            {session.dayEndTime   ? ` → ${format(new Date(session.dayEndTime), 'HH:mm')}` : ' → active'}
            {session.totalDurationMinutes ? ` (${durLabel(session.totalDurationMinutes)})` : ''}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-4 shrink-0 text-xs font-mono">
          {session.totalDelayMinutes > 0 && (
            <span className="text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />{durLabel(session.totalDelayMinutes)}
            </span>
          )}
          <span className="text-muted-foreground flex items-center gap-1">
            <Route className="w-3 h-3" />{stages.length} stages
          </span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="p-5 border-t border-rekker-border bg-background/40">
          {stages.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-4">No stage data recorded for this trip.</p>
            : <RouteTimeline stages={stages} />}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FreshReportsPage() {
  const defaultEnd   = format(new Date(), 'yyyy-MM-dd');
  const defaultStart = format(subDays(new Date(), 13), 'yyyy-MM-dd');

  const [sessions,  setSessions]  = useState([]);
  const [summary,   setSummary]   = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [dateRange, setDateRange] = useState({ start: defaultStart, end: defaultEnd });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = { startDate: dateRange.start, endDate: dateRange.end };
      const [sessRes, sumRes, dailyRes] = await Promise.all([
        api.get('/trips',                    { params }),
        api.get('/trips/reports/summary',    { params: { start: dateRange.start, end: dateRange.end } }),
        api.get('/trips/reports/daily',      { params: { start: dateRange.start, end: dateRange.end } }),
      ]);
      setSessions(sessRes.data  || []);
      setSummary(sumRes.data);
      setDailyData(dailyRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const exportCSV = () => {
    const rows = sessions.map(s => [
      s.vehicle?.regNumber || '',
      s.driver?.fullName   || '',
      s.date,
      s.dayStartTime ? format(new Date(s.dayStartTime), 'HH:mm') : '',
      s.dayEndTime   ? format(new Date(s.dayEndTime),   'HH:mm') : '',
      s.totalDurationMinutes || '',
      s.totalDelayMinutes    || '',
      s.status,
      (s.stages || []).length,
      s.totalStages || '',
    ]);
    const headers = ['Vehicle', 'Driver', 'Date', 'Start', 'End', 'Duration(min)', 'Delays(min)', 'Status', 'Stage Count', 'Total Stages'];
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `fresh-ops-${dateRange.start}-${dateRange.end}.csv`;
    a.click();
  };

  // Build delay array from summary
  const delayItems = summary?.delayBreakdown
    ? Object.entries(summary.delayBreakdown).map(([category, v]) => ({
        label: DELAY_LABELS[category] || category,
        count: v.count,
        totalMin: v.totalMin,
      })).sort((a, b) => b.count - a.count)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Fresh Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Trip analytics, stage performance, delays, and driver stats</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-3.5 h-3.5" />CSV
          </Button>
        </div>
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-rekker-border bg-rekker-surface">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-mono text-muted-foreground">From</span>
        <Input type="date" className="h-8 w-36 text-sm" value={dateRange.start}
          onChange={e => setDateRange(d => ({ ...d, start: e.target.value }))} />
        <span className="text-xs font-mono text-muted-foreground">To</span>
        <Input type="date" className="h-8 w-36 text-sm" value={dateRange.end}
          onChange={e => setDateRange(d => ({ ...d, end: e.target.value }))} />
        <div className="flex gap-2 ml-auto">
          {[
            { label: 'Today',   start: format(new Date(), 'yyyy-MM-dd'),             end: format(new Date(), 'yyyy-MM-dd') },
            { label: '7 days',  start: format(subDays(new Date(), 6), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') },
            { label: '30 days', start: format(subDays(new Date(), 29),'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') },
          ].map(({ label, start, end }) => (
            <Button key={label} variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => setDateRange({ start, end })}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Truck}        label="Total Trips"    value={summary?.totalSessions}
              sub={`${summary?.completedSessions || 0} completed`} />
            <StatCard icon={Clock}        label="Avg Duration"   value={durLabel(summary?.avgDurationMinutes)}
              color="text-blue-400" bg="bg-blue-500/10"
              sub={`${summary?.totalStages || 0} total stages`} />
            <StatCard icon={AlertTriangle}label="Total Delay"    value={durLabel(summary?.totalDelayMinutes)}
              color="text-amber-400" bg="bg-amber-500/10"
              sub={`${delayItems.length} delay types`} />
            <StatCard icon={CheckCircle2} label="Completed"      value={summary?.completedSessions}
              color="text-emerald-400" bg="bg-emerald-500/10"
              sub={`${summary?.activeSessions || 0} still active`} />
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
              <TabsTrigger value="drivers">Drivers</TabsTrigger>
              <TabsTrigger value="delays">Delays</TabsTrigger>
              <TabsTrigger value="trips">Trip Log</TabsTrigger>
            </TabsList>

            {/* ── Overview ── */}
            <TabsContent value="overview" className="space-y-5">
              {/* Daily trend */}
              <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">Daily Trend</p>
                </div>
                <TrendSparkline data={dailyData} />
              </div>

              {/* Top locations */}
              {summary?.topLocations?.length > 0 && (
                <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-4 h-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">Most Visited Locations</p>
                  </div>
                  <MiniBarChart
                    data={summary.topLocations}
                    valueKey="count"
                    labelKey="location"
                    colorClass="bg-primary"
                  />
                </div>
              )}
            </TabsContent>

            {/* ── Vehicles ── */}
            <TabsContent value="vehicles">
              <div className="rounded-xl border border-rekker-border bg-rekker-surface overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rekker-border bg-rekker-surface/80">
                      {['Vehicle', 'Trips', 'Total Time', 'Total Delay', 'Avg Delay/Trip'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.vehicleStats || []).map((v, i) => (
                      <tr key={i} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Truck className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <span className="font-mono font-semibold text-foreground">{v.reg}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-semibold text-foreground">{v.trips}</td>
                        <td className="px-5 py-3 font-mono text-sm text-foreground">{durLabel(v.totalMin)}</td>
                        <td className="px-5 py-3">
                          <span className={cn('font-mono text-sm', v.delays > 0 ? 'text-amber-400' : 'text-muted-foreground')}>
                            {v.delays > 0 ? durLabel(v.delays) : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-sm text-muted-foreground">
                          {v.trips > 0 ? durLabel(Math.round(v.delays / v.trips)) : '—'}
                        </td>
                      </tr>
                    ))}
                    {!summary?.vehicleStats?.length && (
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground text-sm">No vehicle data for this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* ── Drivers ── */}
            <TabsContent value="drivers">
              <div className="rounded-xl border border-rekker-border bg-rekker-surface overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rekker-border bg-rekker-surface/80">
                      {['Driver', 'Trips', 'Completed', 'Completion %', 'Total Time', 'Total Delay'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.driverStats || []).map((d, i) => {
                      const pct = d.trips > 0 ? Math.round((d.completed / d.trips) * 100) : 0;
                      return (
                        <tr key={i} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                                {d.name.charAt(0)}
                              </div>
                              <span className="font-medium text-foreground">{d.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 font-semibold text-foreground">{d.trips}</td>
                          <td className="px-5 py-3 text-emerald-400 font-mono">{d.completed}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="font-mono text-xs text-foreground">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 font-mono text-sm text-foreground">{durLabel(d.totalMin)}</td>
                          <td className="px-5 py-3">
                            <span className={cn('font-mono text-sm', d.delays > 0 ? 'text-amber-400' : 'text-muted-foreground')}>
                              {d.delays > 0 ? durLabel(d.delays) : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!summary?.driverStats?.length && (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">No driver data for this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* ── Delays ── */}
            <TabsContent value="delays" className="space-y-4">
              {delayItems.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No delays recorded for this period.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
                    <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Delay Frequency</p>
                    <MiniBarChart data={delayItems} valueKey="count" labelKey="label" colorClass="bg-amber-500/80" />
                  </div>

                  <div className="rounded-xl border border-rekker-border bg-rekker-surface overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-rekker-border bg-rekker-surface/80">
                          {['Category', 'Occurrences', 'Total Time', 'Avg per Occurrence'].map(h => (
                            <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {delayItems.map((d, i) => (
                          <tr key={i} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-foreground">{d.label}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 font-semibold text-foreground">{d.count}</td>
                            <td className="px-5 py-3 font-mono text-amber-400">{durLabel(d.totalMin)}</td>
                            <td className="px-5 py-3 font-mono text-muted-foreground">
                              {d.count > 0 ? durLabel(Math.round(d.totalMin / d.count)) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── Trip Log ── */}
            <TabsContent value="trips" className="space-y-3">
              {sessions.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl">
                  <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No trips found for selected date range.</p>
                </div>
              ) : (
                sessions.map(s => <SessionRow key={s._id} session={s} />)
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}