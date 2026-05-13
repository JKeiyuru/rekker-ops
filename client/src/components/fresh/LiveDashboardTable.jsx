// client/src/components/fresh/LiveDashboardTable.jsx
// Real-time view of all active trip sessions for admins.

import { format } from 'date-fns';
import { Truck, Clock, MapPin, Users, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_COLOR = {
  in_transit: { label: 'In Transit', variant: 'warning'  },
  arrived:    { label: 'At Location', variant: 'default' },
  completed:  { label: 'Completed',  variant: 'success'  },
};

function minutesToLabel(min) {
  if (min == null) return '—';
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export default function LiveDashboardTable({ sessions = [], loading = false }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-rekker-border bg-rekker-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <div className="text-center py-12 border border-dashed border-border rounded-xl">
        <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No active trips right now.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-rekker-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rekker-border bg-rekker-surface">
            {['Vehicle', 'Driver', 'Current Location', 'Stage', 'Time There', 'Delays', 'Day Start'].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => {
            const active = s.activeStage;
            const stageStatus = active?.status || 'arrived';
            const cfg = STATUS_COLOR[stageStatus] || STATUS_COLOR.arrived;
            const hasDelays = (s.totalDelayMinutes || 0) > 0;

            return (
              <tr
                key={s._id}
                className={cn(
                  'border-b border-rekker-border/50 hover:bg-accent/20 transition-colors',
                  i % 2 !== 0 && 'bg-rekker-surface/20'
                )}
              >
                {/* Vehicle */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-mono font-semibold text-foreground text-sm">
                      {s.vehicle?.regNumber || '—'}
                    </span>
                  </div>
                </td>

                {/* Driver */}
                <td className="px-4 py-3">
                  <div>
                    <p className="text-foreground font-medium text-sm">{s.driver?.fullName || '—'}</p>
                    {s.helpers?.length > 0 && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Users className="w-2.5 h-2.5" />
                        +{s.helpers.length} helper{s.helpers.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </td>

                {/* Current Location */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-foreground font-medium">
                      {s.currentLocation || '—'}
                    </span>
                  </div>
                </td>

                {/* Stage status */}
                <td className="px-4 py-3">
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                </td>

                {/* Time at current location */}
                <td className="px-4 py-3">
                  <span className={cn(
                    'font-mono text-xs font-medium',
                    (s.minutesAtCurrentLocation || 0) > 90
                      ? 'text-destructive'
                      : (s.minutesAtCurrentLocation || 0) > 45
                      ? 'text-amber-400'
                      : 'text-foreground'
                  )}>
                    <Clock className="w-3 h-3 inline mr-1" />
                    {minutesToLabel(s.minutesAtCurrentLocation)}
                  </span>
                </td>

                {/* Delays */}
                <td className="px-4 py-3">
                  {hasDelays ? (
                    <span className="flex items-center gap-1 text-amber-400 text-xs font-mono">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {minutesToLabel(s.totalDelayMinutes)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                  )}
                </td>

                {/* Day start */}
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.dayStartTime ? format(new Date(s.dayStartTime), 'HH:mm') : '—'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
