// client/src/pages/MerchandiserDashboard.jsx
// Personal dashboard for merchandisers — shows today's assignment,
// check-in history, and a performance summary.

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  MapPin, Clock, CheckCircle2, AlertTriangle, XCircle,
  Loader2, TrendingUp, Calendar, Navigation,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { syncQueue } from '@/lib/offlineQueue';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  ACTIVE:     { label: 'Active',     color: 'text-primary',     bg: 'bg-primary/10 border-primary/30'       },
  COMPLETE:   { label: 'Complete',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  INCOMPLETE: { label: 'Incomplete', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30'    },
  FLAGGED:    { label: 'Flagged',    color: 'text-destructive',  bg: 'bg-destructive/10 border-destructive/30' },
};

function lateLabel(minutes) {
  if (minutes == null) return null;
  if (minutes <= -1)  return { text: `${Math.abs(minutes)}m early`, color: 'text-emerald-400' };
  if (minutes <= 10)  return { text: 'On time',                     color: 'text-emerald-400' };
  if (minutes <= 30)  return { text: `${minutes}m late`,            color: 'text-amber-400'   };
  return                    { text: `${minutes}m very late`,        color: 'text-destructive'  };
}

function StatCard({ icon: Icon, label, value, color = 'text-primary', bg = 'bg-primary/10' }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3">
      <div className={cn('flex items-center justify-center w-8 h-8 rounded-lg shrink-0', bg)}>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-display tracking-wider text-foreground mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  );
}

// ── Session history row ───────────────────────────────────────────────────────
function SessionRow({ session }) {
  const cfg    = STATUS_CFG[session.sessionStatus] || STATUS_CFG.ACTIVE;
  const late   = lateLabel(session.lateByMinutes);
  const dur    = session.durationMinutes != null
    ? `${Math.floor(session.durationMinutes / 60)}h ${session.durationMinutes % 60}m`
    : '—';

  return (
    <div className="flex items-start justify-between py-3 border-b border-border/50 last:border-0 gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground text-sm truncate">{session.branch?.name}</span>
          <span className={cn('text-xs font-mono font-medium border px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-mono flex-wrap">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {session.date}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {session.checkInTime ? format(new Date(session.checkInTime), 'HH:mm') : '—'}
            {session.checkOutTime ? ` → ${format(new Date(session.checkOutTime), 'HH:mm')}` : ''}
            <span className="ml-1">({dur})</span>
          </span>
          {session.checkInDistanceMeters != null && (
            <span className="flex items-center gap-1">
              <Navigation className="w-3 h-3" />
              {session.checkInDistanceMeters}m
            </span>
          )}
        </div>
      </div>
      {late && (
        <span className={cn('text-xs font-mono font-semibold shrink-0', late.color)}>
          {late.text}
        </span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MerchandiserDashboard() {
  const { user }                        = useAuthStore();
  const [todayAssignments, setTodayAssignments] = useState([]);
  const [history, setHistory]           = useState([]);
  const [report, setReport]             = useState(null);
  const [loading, setLoading]           = useState(true);
  const today = format(new Date(), 'EEEE, dd MMMM yyyy');

  useEffect(() => {
    const load = async () => {
      try {
        const [assignRes, histRes, reportRes] = await Promise.all([
          api.get('/assignments/my'),
          api.get('/checkins/my/history', { params: { days: 30 } }),
          api.get(`/checkins/reports/merchandiser/${user._id}`, {
            params: { start: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0] },
          }),
        ]);
        setTodayAssignments(Array.isArray(assignRes.data) ? assignRes.data : []);
        setHistory(Array.isArray(histRes.data) ? histRes.data : []);
        setReport(reportRes.data);
      } finally {
        setLoading(false);
      }
    };
    load();
    if (navigator.onLine) syncQueue(api);
  }, [user._id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">{today}</p>
        <h1 className="page-title">My Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome, <span className="text-foreground font-medium">{user?.fullName}</span>
        </p>
      </div>

      {/* Today's assignments */}
      <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 space-y-3">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          Today's Assignment{todayAssignments.length !== 1 ? 's' : ''}
        </p>
        {todayAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No assignments for today. Contact your team lead.</p>
        ) : (
          todayAssignments.map((a) => (
            <div key={a._id} className="flex items-center gap-3 p-3 rounded-lg bg-accent/30 border border-border">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">{a.branch?.name}</p>
                {a.expectedCheckIn && (
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    Expected: {a.expectedCheckIn}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 30-day stats */}
      {report && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={CheckCircle2}  label="Complete Sessions" value={report.completeSessions}   color="text-emerald-400" bg="bg-emerald-500/10" />
          <StatCard icon={Clock}         label="Hours Worked (30d)" value={`${report.totalHoursWorked}h`} color="text-blue-400" bg="bg-blue-500/10" />
          <StatCard icon={AlertTriangle} label="Late Arrivals"      value={report.lateArrivals}      color="text-amber-400"  bg="bg-amber-500/10"  />
          <StatCard icon={TrendingUp}    label="Days Present"       value={report.daysPresent}       />
        </div>
      )}

      {/* History tabs */}
      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Check-In History</TabsTrigger>
          <TabsTrigger value="incomplete">Incomplete Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          {history.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-xl">
              <p className="text-sm text-muted-foreground">No check-ins in the last 30 days.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
              {history.map((s) => <SessionRow key={s._id} session={s} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="incomplete">
          {(() => {
            const incomplete = history.filter((s) =>
              s.sessionStatus === 'INCOMPLETE' || s.sessionStatus === 'ACTIVE'
            );
            return incomplete.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No incomplete sessions. Great work!</p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs text-amber-400 font-mono mb-3">
                  {incomplete.length} session{incomplete.length !== 1 ? 's' : ''} without check-out
                </p>
                {incomplete.map((s) => <SessionRow key={s._id} session={s} />)}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
