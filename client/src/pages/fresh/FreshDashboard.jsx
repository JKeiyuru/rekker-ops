// client/src/pages/fresh/FreshDashboard.jsx
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Truck, Clock, AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import LiveDashboardTable from '@/components/fresh/LiveDashboardTable';
import api from '@/lib/api';

function StatCard({ icon: Icon, label, value, color = 'text-primary', bg = 'bg-primary/10' }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3">
      <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', bg)}>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-display tracking-wider text-foreground mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  );
}

export default function FreshDashboard() {
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [liveRes, summaryRes] = await Promise.all([
        api.get('/trips/live'),
        api.get('/trips/reports/summary', { params: { start: format(new Date(), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') } }),
      ]);
      setSessions(liveRes.data || []);
      setSummary(summaryRes.data);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); const t = setInterval(() => fetch(true), 30000); return () => clearInterval(t); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Fresh Produce</h1>
          <p className="text-sm text-muted-foreground mt-1">Live operational dashboard — {format(new Date(), 'EEEE dd MMM yyyy')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetch(true)} disabled={refreshing}>
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Truck}        label="Active Trips"    value={summary?.activeSessions}    />
        <StatCard icon={CheckCircle2} label="Completed Today" value={summary?.completedSessions} color="text-emerald-400" bg="bg-emerald-500/10" />
        <StatCard icon={AlertTriangle} label="Total Delays"   value={summary?.totalDelayMinutes ? `${summary.totalDelayMinutes}m` : '0'} color="text-amber-400" bg="bg-amber-500/10" />
        <StatCard icon={Clock}        label="Avg Duration"    value={summary?.avgDurationMinutes ? `${Math.floor(summary.avgDurationMinutes/60)}h${summary.avgDurationMinutes%60}m` : '—'} color="text-blue-400" bg="bg-blue-500/10" />
      </div>

      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
          Live — {sessions.length} active vehicle{sessions.length !== 1 ? 's' : ''}
        </p>
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          : <LiveDashboardTable sessions={sessions} />}
      </div>
    </div>
  );
}
