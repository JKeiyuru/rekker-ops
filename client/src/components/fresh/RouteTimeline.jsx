// client/src/components/fresh/RouteTimeline.jsx
// Displays the chronological sequence of stages in a trip session.

import { format } from 'date-fns';
import {
  CheckCircle2, Circle, ArrowDown, Clock, AlertTriangle, Wifi,
  MapPin, Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DELAY_LABELS = {
  traffic:          'Traffic',
  supplier_delay:   'Supplier delay',
  loading_delay:    'Loading delay',
  vehicle_issue:    'Vehicle issue',
  rain:             'Rain',
  breakdown:        'Breakdown',
  waiting_approval: 'Waiting for approval',
  other:            'Other',
};

function GpsTag({ status }) {
  if (!status || status === 'valid') return null;
  const cfg = {
    mismatch:    { label: 'Wrong location', color: 'text-amber-400' },
    unavailable: { label: 'GPS off',        color: 'text-muted-foreground' },
  }[status] || {};
  return (
    <span className={cn('text-[10px] font-mono ml-2', cfg.color)}>
      · {cfg.label}
    </span>
  );
}

export default function RouteTimeline({ stages = [], compact = false }) {
  if (!stages.length) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        No route stages yet.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {stages.map((stage, i) => {
        const isLast      = i === stages.length - 1;
        const isCompleted = stage.status === 'completed';
        const isActive    = stage.status === 'in_transit' || stage.status === 'arrived';
        const dur         = stage.durationMinutes;

        return (
          <div key={stage._id || i} className="flex gap-3">
            {/* Spine */}
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2',
                isCompleted ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                  : isActive ? 'bg-primary/20 border-primary text-primary animate-pulse'
                  : 'bg-muted border-border text-muted-foreground'
              )}>
                {isCompleted
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : isActive
                  ? <Truck className="w-3.5 h-3.5" />
                  : <Circle className="w-3.5 h-3.5" />}
              </div>
              {!isLast && (
                <div className={cn(
                  'w-0.5 flex-1 my-1 min-h-[24px]',
                  isCompleted ? 'bg-emerald-500/40' : 'bg-border'
                )} />
              )}
            </div>

            {/* Content */}
            <div className={cn('flex-1 pb-4', isLast && 'pb-2')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {stage.fromLocation}
                    <span className="text-muted-foreground font-normal mx-2">→</span>
                    {stage.toLocation === 'en_route' ? '…' : stage.toLocation}
                  </p>

                  {/* Timestamps */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {stage.checkOutTime && (
                      <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />
                        Left {format(new Date(stage.checkOutTime), 'HH:mm')}
                        <GpsTag status={stage.checkOutGpsStatus} />
                      </span>
                    )}
                    {stage.checkInTime && (
                      <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />
                        Arrived {format(new Date(stage.checkInTime), 'HH:mm')}
                        <GpsTag status={stage.checkInGpsStatus} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Duration badge */}
                {dur != null && (
                  <span className={cn(
                    'text-[11px] font-mono px-2 py-0.5 rounded-full shrink-0 border',
                    dur > 120
                      ? 'bg-destructive/10 border-destructive/30 text-destructive'
                      : dur > 60
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  )}>
                    <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                    {dur < 60 ? `${dur}m` : `${Math.floor(dur/60)}h ${dur%60}m`}
                  </span>
                )}
              </div>

              {/* Delay logs */}
              {!compact && stage.delays?.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {stage.delays.map((d, di) => (
                    <div key={di} className="flex items-start gap-1.5 text-[11px] text-amber-400 bg-amber-500/5 rounded px-2 py-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-medium">{DELAY_LABELS[d.category] || d.category}</span>
                        {d.durationMin > 0 && ` (+${d.durationMin}m)`}
                        {d.notes && ` — ${d.notes}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Offline flag */}
              {stage.isOfflineEntry && (
                <span className="text-[10px] font-mono text-blue-400 flex items-center gap-1 mt-1">
                  <Wifi className="w-2.5 h-2.5" />offline entry
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
