// client/src/pages/deliveries/MyTripsPage.jsx
// Driver / turnboy / merchandiser view of their own past trip sessions.

import { useEffect, useState } from 'react';
import { Truck, Loader2, MapPin, Clock, AlertTriangle, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function MyTripsPage() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    api.get('/packaging-trips/my-trips', { params: { days: 30 } })
      .then(r => setTrips(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><Truck className="w-6 h-6 text-primary" /> My Trips</h1>
        <p className="text-sm text-muted-foreground mt-1">Your last 30 days of delivery trips.</p>
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <p className="text-sm text-muted-foreground">You haven't done any trips in the last 30 days.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trips.map((t) => {
            const open = expanded[t._id];
            return (
              <div key={t._id} className="rounded-xl border border-rekker-border overflow-hidden">
                <button onClick={() => setExpanded(p => ({ ...p, [t._id]: !p[t._id] }))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-rekker-surface hover:bg-accent/30 transition text-left">
                  <div className="flex items-center gap-3">
                    <ChevronDown className={cn('w-4 h-4 transition-transform', !open && '-rotate-90')} />
                    <div>
                      <p className="text-sm font-medium">{t.date} · <span className="font-mono text-primary">{t.vehicle?.regNumber}</span></p>
                      <p className="text-[11px] text-muted-foreground">{t.totalStages || 0} stages · {(t.helpers || []).map(h => h.fullName).join(', ') || 'solo'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={t.status === 'completed' ? 'default' : t.status === 'active' ? 'warning' : 'outline'}>{t.status}</Badge>
                    {t.totalDurationMinutes != null && (
                      <span className="font-mono text-muted-foreground"><Clock className="w-3 h-3 inline" /> {t.totalDurationMinutes}m</span>
                    )}
                    {t.totalDelayMinutes > 0 && (
                      <span className="font-mono text-amber-400"><AlertTriangle className="w-3 h-3 inline" /> {t.totalDelayMinutes}m</span>
                    )}
                  </div>
                </button>
                {open && (
                  <div className="border-t border-rekker-border/40 p-4 space-y-2 bg-background">
                    {(t.stages || []).length === 0
                      ? <p className="text-xs text-muted-foreground">No stages recorded.</p>
                      : (t.stages || []).map((st, i) => (
                        <div key={i} className="flex items-start gap-3 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium">{st.fromLocation} <span className="text-muted-foreground">→</span> {st.toLocation}</p>
                            <p className="text-muted-foreground font-mono">
                              {st.checkOutTime ? format(new Date(st.checkOutTime), 'HH:mm') : '—'}
                              {st.checkInTime ? ` → ${format(new Date(st.checkInTime), 'HH:mm')}` : ''}
                              {st.durationMinutes != null ? ` · ${st.durationMinutes}m` : ''}
                              {(st.delays || []).length > 0 ? ` · ${st.totalDelayMinutes}m delay` : ''}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[9px]">{st.status}</Badge>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
