// client/src/components/fresh/TripSessionDrawer.jsx
// Slide-in panel showing full stage timeline + details for any session.
// Used from both the dashboard and reports page.
// Props: sessionId (string | null), onClose (fn)

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  X, Truck, Users, MapPin, Clock, AlertTriangle,
  Route, CheckCircle2, Loader2, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import RouteTimeline from '@/components/fresh/RouteTimeline';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

const durLabel = m => {
  if (m == null) return '—';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const STATUS_CFG = {
  active:    { label: 'Active',    variant: 'default'  },
  completed: { label: 'Done',      variant: 'success'  },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

export default function TripSessionDrawer({ sessionId, onClose }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) { setSession(null); return; }
    setLoading(true);
    api.get(`/trips/${sessionId}`)
      .then(r => setSession(r.data))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (!sessionId) return null;

  const stages       = session?.stages || [];
  const doneStages   = stages.filter(s => s.status === 'completed');
  const allDelays    = stages.flatMap(s => s.delays || []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-rekker-surface border-l border-rekker-border flex flex-col shadow-2xl animate-slide-in-right">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-rekker-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <Truck className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono font-semibold text-foreground">
              {session?.vehicle?.regNumber || '—'}
            </p>
            <p className="text-xs text-muted-foreground">{session?.driver?.fullName}</p>
          </div>
          {session && (
            <Badge variant={STATUS_CFG[session.status]?.variant || 'pending'}>
              {STATUS_CFG[session.status]?.label || session.status}
            </Badge>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          )}

          {!loading && session && (
            <>
              {/* Trip overview */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Calendar, label: 'Date',          value: session.date },
                  { icon: MapPin,   label: 'Start',         value: session.startLocation },
                  { icon: Clock,    label: 'Started',       value: session.dayStartTime ? format(new Date(session.dayStartTime), 'HH:mm') : '—' },
                  { icon: Clock,    label: 'Ended',         value: session.dayEndTime   ? format(new Date(session.dayEndTime),   'HH:mm') : '—' },
                  { icon: Route,    label: 'Total Duration',value: durLabel(session.totalDurationMinutes) },
                  { icon: Route,    label: 'Stages Done',   value: `${doneStages.length} / ${stages.length}` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-lg bg-accent/30 border border-border px-3 py-2.5">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Icon className="w-3 h-3" />{label}
                    </p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {/* Helpers */}
              {session.helpers?.length > 0 && (
                <div className="rounded-lg bg-accent/30 border border-border px-3 py-2.5">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
                    <Users className="w-3 h-3" />Team
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {session.helpers.map(h => (
                      <span key={h._id} className="px-2.5 py-1 rounded-full bg-background border border-border text-xs text-foreground">
                        {h.fullName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Delay summary */}
              {allDelays.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3 space-y-2">
                  <p className="text-[10px] font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {allDelays.length} Delay{allDelays.length !== 1 ? 's' : ''} — {durLabel(session.totalDelayMinutes)} total
                  </p>
                  {allDelays.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-amber-400 font-medium capitalize w-28 shrink-0">
                        {d.category?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-muted-foreground flex-1">
                        {d.durationMin > 0 && `+${d.durationMin}m`}
                        {d.notes && ` — ${d.notes}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Route timeline */}
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
                  Route Timeline
                </p>
                {stages.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">No stages recorded.</p>
                  : <RouteTimeline stages={stages} />}
              </div>
            </>
          )}

          {!loading && !session && (
            <div className="text-center py-16">
              <p className="text-sm text-muted-foreground">Could not load session details.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={onClose}>Close</Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}