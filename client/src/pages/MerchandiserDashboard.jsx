// client/src/pages/MerchandiserDashboard.jsx
// Personal dashboard for merchandisers — shows today's schedule (if any),
// recent check-in history, and a 30-day performance summary.
// No longer requires assignments to function.

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  MapPin, Clock, CheckCircle2, AlertTriangle, XCircle,
  Loader2, TrendingUp, Calendar, Navigation, Star, Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { syncQueue } from '@/lib/offlineQueue';

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  ACTIVE:     { label: 'Active',     color: 'text-primary',     bg: 'bg-primary/10 border-primary/30'        },
  COMPLETE:   { label: 'Complete',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  INCOMPLETE: { label: 'Incomplete', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30'    },
  FLAGGED:    { label: 'Flagged',    color: 'text-destructive',  bg: 'bg-destructive/10 border-destructive/30' },
};

function lateLabel(minutes) {
  if (minutes == null) return null;
  if (minutes <= -1)   return { text: `${Math.abs(minutes)}m early`, color: 'text-emerald-400' };
  if (minutes <= 10)   return { text: 'On time',                     color: 'text-emerald-400' };
  if (minutes <= 30)   return { text: `${minutes}m late`,            color: 'text-amber-400'   };
  return                     { text: `${minutes}m very late`,        color: 'text-destructive'  };
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary', bg = 'bg-primary/10' }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3">
      <div className={cn('flex items-center justify-center w-8 h-8 rounded-lg shrink-0', bg)}>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-display tracking-wider text-foreground mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Session history row ───────────────────────────────────────────────────────
function SessionRow({ session }) {
  const cfg  = STATUS_CFG[session.sessionStatus] || STATUS_CFG.ACTIVE;
  const late = lateLabel(session.lateByMinutes);
  const dur  = session.durationMinutes != null
    ? `${Math.floor(session.durationMinutes / 60)}h ${session.durationMinutes % 60}m`
    : '—';

  return (
    <div className="flex items-start justify-between py-3 border-b border-border/50 last:border-0 gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground text-sm truncate">{session.branch?.name}</span>
          <span className={cn('text-xs font-mono font-medium border px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
            {cfg.label}
          </span>
          {/* Unscheduled badge */}
          {session.notes === 'Unscheduled visit' && (
            <span className="text-[10px] font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded-full">
              unscheduled
            </span>
          )}
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

// ── Today's check-in summary card ─────────────────────────────────────────────
function TodayCard({ todaySessions, navigate }) {
  const active    = todaySessions.find((s) => !s.checkOutTime);
  const completed = todaySessions.filter((s) => !!s.checkOutTime);
  const totalTime = completed.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          Today's Activity
        </p>
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => navigate('/checkin')}
        >
          <LogInIcon />
          {active ? 'View Check-In' : 'Check In'}
        </Button>
      </div>

      {todaySessions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No check-ins yet today.</p>
      ) : (
        <>
          {active && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">{active.branch?.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  Checked in at {format(new Date(active.checkInTime), 'HH:mm')}
                </p>
              </div>
            </div>
          )}

          {completed.map((s) => (
            <div key={s._id} className="flex items-center justify-between text-sm py-1">
              <span className="text-foreground">{s.branch?.name}</span>
              <span className="text-xs text-muted-foreground font-mono">
                {Math.floor((s.durationMinutes || 0) / 60)}h {(s.durationMinutes || 0) % 60}m
              </span>
            </div>
          ))}

          {completed.length > 0 && (
            <div className="pt-2 border-t border-border flex justify-between text-xs font-mono text-muted-foreground">
              <span>{completed.length} visit{completed.length !== 1 ? 's' : ''} completed</span>
              <span>{Math.floor(totalTime / 60)}h {totalTime % 60}m total</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Inline icon to avoid import issues in JSX
function LogInIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MerchandiserDashboard() {
  const { user }                          = useAuthStore();
  const navigate                          = useNavigate();
  const [todayAssignments, setTodayAssignments] = useState([]);
  const [history, setHistory]             = useState([]);
  const [report, setReport]               = useState(null);
  const [loading, setLoading]             = useState(true);

  const today     = format(new Date(), 'EEEE, dd MMMM yyyy');
  const todayDate = new Date().toISOString().split('T')[0];

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

  const todaySessions  = history.filter((s) => s.date === todayDate);
  const pastSessions   = history.filter((s) => s.date !== todayDate);
  const incomplete     = history.filter((s) => s.sessionStatus === 'INCOMPLETE' || s.sessionStatus === 'ACTIVE');

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

      {/* Today's activity */}
      <TodayCard todaySessions={todaySessions} navigate={navigate} />

      {/* Scheduled visits today */}
      {todayAssignments.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-mono text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" />
            Scheduled visits today
          </p>
          {todayAssignments.map((a) => {
            const visited = todaySessions.some(
              (s) => s.branch?._id?.toString() === a.branch?._id?.toString()
            );
            return (
              <div key={a._id} className="flex items-center gap-2 text-sm">
                {visited
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  : <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />}
                <span className={cn('font-medium', visited ? 'text-emerald-400' : 'text-foreground')}>
                  {a.branch?.name}
                </span>
                {a.expectedCheckIn && (
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    from {a.expectedCheckIn}
                  </span>
                )}
                {visited && (
                  <span className="text-xs text-emerald-400 font-mono ml-auto">✓ done</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 30-day stats */}
      {report && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={CheckCircle2}
            label="Complete Sessions"
            value={report.completeSessions}
            sub="last 30 days"
            color="text-emerald-400"
            bg="bg-emerald-500/10"
          />
          <StatCard
            icon={Clock}
            label="Hours Worked"
            value={`${report.totalHoursWorked}h`}
            sub="last 30 days"
            color="text-blue-400"
            bg="bg-blue-500/10"
          />
          <StatCard
            icon={AlertTriangle}
            label="Late Arrivals"
            value={report.lateArrivals}
            sub="vs scheduled time"
            color="text-amber-400"
            bg="bg-amber-500/10"
          />
          <StatCard
            icon={TrendingUp}
            label="Days Present"
            value={report.daysPresent}
            sub="unique days checked in"
          />
        </div>
      )}

      {/* History tabs */}
      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="incomplete" className="relative">
            Incomplete
            {incomplete.filter((s) => s.date !== todayDate).length > 0 && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-amber-400 inline-block" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          {pastSessions.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-xl">
              <p className="text-sm text-muted-foreground">No check-ins in the last 30 days.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
              {pastSessions.map((s) => <SessionRow key={s._id} session={s} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="incomplete">
          {(() => {
            const pastIncomplete = incomplete.filter((s) => s.date !== todayDate);
            return pastIncomplete.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No incomplete sessions. Great work!</p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs text-amber-400 font-mono mb-3">
                  {pastIncomplete.length} session{pastIncomplete.length !== 1 ? 's' : ''} without check-out
                </p>
                {pastIncomplete.map((s) => <SessionRow key={s._id} session={s} />)}
                <div className="mt-3 pt-3 border-t border-amber-500/20">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    onClick={() => navigate('/checkin')}
                  >
                    Go to Check-In to complete these
                  </Button>
                </div>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}