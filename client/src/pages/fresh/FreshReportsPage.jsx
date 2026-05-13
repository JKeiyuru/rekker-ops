// client/src/pages/fresh/FreshReportsPage.jsx
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Download, Loader2, Clock, Truck, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import RouteTimeline from '@/components/fresh/RouteTimeline';
import api from '@/lib/api';

const fmt = n => n == null ? '—' : `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
const durLabel = m => { if (!m) return '—'; return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`; };
const STATUS_CFG = { active: { label: 'Active', variant: 'default' }, completed: { label: 'Completed', variant: 'success' }, cancelled: { label: 'Cancelled', variant: 'destructive' } };

function SessionRow({ session }) {
  const [open, setOpen] = useState(false);
  const stages = session.stages || [];

  return (
    <div className="rounded-xl border border-rekker-border overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-4 px-5 py-4 bg-rekker-surface hover:bg-accent/20 transition-colors text-left">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Truck className="w-4 h-4 text-primary" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-semibold text-foreground">{session.vehicle?.regNumber || '—'}</span>
              <span className="text-muted-foreground text-sm">— {session.driver?.fullName}</span>
              <Badge variant={STATUS_CFG[session.status]?.variant || 'pending'}>{STATUS_CFG[session.status]?.label || session.status}</Badge>
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              {session.dayStartTime ? format(new Date(session.dayStartTime), 'HH:mm') : '—'}
              {session.dayEndTime ? ` → ${format(new Date(session.dayEndTime), 'HH:mm')}` : ' → active'}
              {session.totalDurationMinutes && ` (${durLabel(session.totalDurationMinutes)})`}
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 shrink-0 text-xs font-mono">
          {session.totalDelayMinutes > 0 && <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{session.totalDelayMinutes}m delay</span>}
          <span className="text-muted-foreground">{stages.length} stages</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="p-5 border-t border-rekker-border bg-background/40"><RouteTimeline stages={stages} /></div>}
    </div>
  );
}

export default function FreshReportsPage() {
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [dateRange, setDateRange] = useState({ start: format(new Date(), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') });

  const fetch = async () => {
    setLoading(true);
    try {
      const [sessRes, sumRes] = await Promise.all([
        api.get('/trips', { params: { date: undefined } }),
        api.get('/trips/reports/summary', { params: { start: dateRange.start, end: dateRange.end } }),
      ]);
      setSessions(sessRes.data || []); setSummary(sumRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [dateRange]);

  const exportCSV = () => {
    const rows = sessions.map(s => [
      s.vehicle?.regNumber || '', s.driver?.fullName || '', s.date,
      s.dayStartTime ? format(new Date(s.dayStartTime), 'HH:mm') : '',
      s.dayEndTime   ? format(new Date(s.dayEndTime),   'HH:mm') : '',
      s.totalDurationMinutes || '', s.totalDelayMinutes || '', s.status, (s.stages || []).length,
    ]);
    const headers = ['Vehicle','Driver','Date','Start','End','Duration(min)','Delays(min)','Status','Stages'];
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `fresh-ops-report-${dateRange.start}-${dateRange.end}.csv`; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1 className="page-title">Fresh Reports</h1><p className="text-sm text-muted-foreground mt-1">Trip performance, delays, and route analytics</p></div>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-3.5 h-3.5" />CSV</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-rekker-border bg-rekker-surface">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-mono text-muted-foreground">From</span>
        <Input type="date" className="h-8 w-36 text-sm" value={dateRange.start} onChange={e => setDateRange(d => ({ ...d, start: e.target.value }))} />
        <span className="text-xs font-mono text-muted-foreground">To</span>
        <Input type="date" className="h-8 w-36 text-sm" value={dateRange.end} onChange={e => setDateRange(d => ({ ...d, end: e.target.value }))} />
        <Button size="sm" onClick={fetch} disabled={loading}>{loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}</Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Truck,         label: 'Total Sessions',  value: summary.totalSessions,         color: 'text-primary',     bg: 'bg-primary/10'     },
            { icon: CheckCircle2,  label: 'Completed',       value: summary.completedSessions,      color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { icon: Clock,         label: 'Avg Duration',    value: durLabel(summary.avgDurationMinutes), color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { icon: AlertTriangle, label: 'Total Delay',     value: durLabel(summary.totalDelayMinutes), color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3">
              <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', bg)}><Icon className={cn('w-4 h-4', color)} /></div>
              <div><p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p><p className="text-2xl font-display tracking-wider text-foreground mt-0.5">{value ?? '—'}</p></div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div> : (
        <div className="space-y-3">
          {sessions.length === 0
            ? <div className="text-center py-16 border border-dashed border-border rounded-xl"><p className="text-sm text-muted-foreground">No trips found for selected date range.</p></div>
            : sessions.map(s => <SessionRow key={s._id} session={s} />)}
        </div>
      )}
    </div>
  );
}
