// client/src/pages/AttendancePage.jsx
// Admin/team-lead view showing daily attendance summaries, per-merchandiser
// check-in history, location statuses, and flagged entries.

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Users, CheckCircle2, XCircle, AlertTriangle, Clock,
  CalendarDays, Loader2, Navigation, WifiOff, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

const TODAY = new Date().toISOString().split('T')[0];

// ── Status helpers ────────────────────────────────────────────────────────────
const SESSION_STATUS_UI = {
  ACTIVE:     { label: 'Active',     variant: 'default'     },
  COMPLETE:   { label: 'Complete',   variant: 'success'     },
  INCOMPLETE: { label: 'Incomplete', variant: 'warning'     },
  FLAGGED:    { label: 'Flagged',    variant: 'destructive' },
};

const CHECKIN_STATUS_UI = {
  VALID:             { label: 'On Location',    color: 'text-emerald-400' },
  MISMATCH:          { label: 'Wrong Location', color: 'text-destructive'  },
  LOCATION_DISABLED: { label: 'GPS Off',        color: 'text-amber-400'   },
  OFFLINE:           { label: 'Offline',        color: 'text-blue-400'    },
};

function StatCard({ icon: Icon, label, value, color = 'text-primary', bg = 'bg-primary/10' }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3">
      <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', bg)}>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
        <p className="text-3xl font-display tracking-wider text-foreground mt-1">{value ?? '—'}</p>
      </div>
    </div>
  );
}

// ── Daily tab ─────────────────────────────────────────────────────────────────
function DailyTab() {
  const [date, setDate]         = useState(TODAY);
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(true);

  const fetch = (d) => {
    setLoading(true);
    api.get('/checkins/summary', { params: { date: d } })
      .then((r) => setSummary(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(date); }, [date]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <Input type="date" className="h-8 w-44 text-sm" value={date} onChange={(e) => { setDate(e.target.value); }} />
        <Button variant="ghost" size="sm" onClick={() => setDate(TODAY)}>Today</Button>
        <Button variant="outline" size="sm" onClick={() => fetch(date)} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users}        label="Assigned"     value={summary?.totalAssigned}     />
            <StatCard icon={CheckCircle2} label="Checked In"   value={summary?.totalCheckedIn}    color="text-emerald-400" bg="bg-emerald-500/10" />
            <StatCard icon={XCircle}      label="Absent"       value={summary?.totalAbsent}       color="text-destructive" bg="bg-destructive/10" />
            <StatCard icon={AlertTriangle} label="Flagged"     value={summary?.flaggedSessions}   color="text-amber-400"  bg="bg-amber-500/10"  />
          </div>

          {/* Sessions table */}
          {summary?.sessions?.length > 0 ? (
            <div className="rounded-xl border border-rekker-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rekker-border bg-rekker-surface">
                    {['Merchandiser', 'Branch', 'Check-In', 'Check-Out', 'Duration', 'Distance', 'Status', 'Flags'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.sessions.map((s, i) => {
                    const ciUI = CHECKIN_STATUS_UI[s.checkInStatus] || {};
                    return (
                      <tr key={s._id} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{s.merchandiser?.fullName}</td>
                        <td className="px-4 py-3 text-foreground">{s.branch?.name}</td>
                        <td className="px-4 py-3 font-mono text-xs">{s.checkInTime ? format(new Date(s.checkInTime), 'HH:mm') : '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{s.checkOutTime ? format(new Date(s.checkOutTime), 'HH:mm') : '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{s.durationMinutes != null ? `${s.durationMinutes}m` : '—'}</td>
                        <td className="px-4 py-3">
                          {s.checkInDistanceMeters != null ? (
                            <span className={cn('font-mono text-xs flex items-center gap-1', s.checkInDistanceMeters > (s.branch?.allowedRadius || 100) ? 'text-destructive' : 'text-emerald-400')}>
                              <Navigation className="w-3 h-3" />{s.checkInDistanceMeters}m
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={SESSION_STATUS_UI[s.sessionStatus]?.variant || 'pending'}>
                            {SESSION_STATUS_UI[s.sessionStatus]?.label || s.sessionStatus}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {s.checkInStatus !== 'VALID' && (
                              <span className={cn('text-[10px] font-mono', ciUI.color)}>{ciUI.label}</span>
                            )}
                            {s.isOfflineEntry && (
                              <span className="flex items-center gap-0.5 text-[10px] font-mono text-blue-400">
                                <WifiOff className="w-2.5 h-2.5" />offline
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-border rounded-xl">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No check-ins recorded for this date.</p>
            </div>
          )}

          {/* Absent merchandisers */}
          {summary?.assignments && summary.totalAbsent > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-xs font-mono text-destructive uppercase tracking-wider mb-2">Absent / Not Checked In</p>
              <div className="space-y-1.5">
                {summary.assignments
                  .filter((a) => !summary.sessions.some((s) => s.merchandiser?._id?.toString() === a.merchandiser?._id?.toString()))
                  .map((a) => (
                    <div key={a._id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{a.merchandiser?.fullName}</span>
                      <span className="text-xs text-muted-foreground">{a.branch?.name}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Per Merchandiser tab ──────────────────────────────────────────────────────
function MerchandiserTab() {
  const [merchandisers, setMerchandisers] = useState([]);
  const [selectedId, setSelectedId]       = useState('');
  const [report, setReport]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [dateRange, setDateRange]         = useState({ start: '', end: '' });

  useEffect(() => {
    api.get('/users').then((r) => setMerchandisers(r.data.filter((u) => u.role === 'merchandiser')));
  }, []);

  const fetchReport = () => {
    if (!selectedId) return;
    setLoading(true);
    api.get(`/checkins/reports/merchandiser/${selectedId}`, { params: { start: dateRange.start, end: dateRange.end } })
      .then((r) => setReport(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (selectedId) fetchReport(); }, [selectedId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end p-4 rounded-xl border border-rekker-border bg-rekker-surface">
        <div className="space-y-1.5 flex-1 min-w-48">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Merchandiser</label>
          <select
            className="flex h-8 w-full rounded-md border border-input bg-input px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Select merchandiser…</option>
            {merchandisers.map((m) => <option key={m._id} value={m._id}>{m.fullName}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">From</label>
          <Input type="date" className="h-8 w-36 text-sm" value={dateRange.start} onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">To</label>
          <Input type="date" className="h-8 w-36 text-sm" value={dateRange.end} onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))} />
        </div>
        <Button size="sm" onClick={fetchReport} disabled={!selectedId || loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
        </Button>
      </div>

      {loading && <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>}

      {report && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={CheckCircle2}  label="Total Sessions"    value={report.totalSessions}       />
            <StatCard icon={Clock}         label="Hours Worked"       value={`${report.totalHoursWorked}h`} color="text-blue-400"    bg="bg-blue-500/10"    />
            <StatCard icon={AlertTriangle} label="Mismatches"         value={report.locationMismatches}  color="text-amber-400"  bg="bg-amber-500/10"  />
            <StatCard icon={XCircle}       label="Days Absent"        value={report.daysAbsent}          color="text-destructive" bg="bg-destructive/10" />
          </div>

          {report.sessions.length > 0 && (
            <div className="rounded-xl border border-rekker-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rekker-border bg-rekker-surface">
                    {['Date', 'Branch', 'Check-In', 'Check-Out', 'Duration', 'Status'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.sessions.map((s, i) => (
                    <tr key={s._id} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{s.date}</td>
                      <td className="px-4 py-3 text-foreground">{s.branch?.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.checkInTime ? format(new Date(s.checkInTime), 'HH:mm') : '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.checkOutTime ? format(new Date(s.checkOutTime), 'HH:mm') : '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.durationMinutes != null ? `${s.durationMinutes}m` : '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={SESSION_STATUS_UI[s.sessionStatus]?.variant || 'pending'}>
                          {SESSION_STATUS_UI[s.sessionStatus]?.label || s.sessionStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">Merchandiser check-in records, location verification, and reports</p>
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily View</TabsTrigger>
          <TabsTrigger value="merchandiser">Per Merchandiser</TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><DailyTab /></TabsContent>
        <TabsContent value="merchandiser"><MerchandiserTab /></TabsContent>
      </Tabs>
    </div>
  );
}
