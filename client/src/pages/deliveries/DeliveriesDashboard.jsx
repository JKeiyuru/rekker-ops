// client/src/pages/deliveries/DeliveriesDashboard.jsx
// Live dashboard for ordinary-goods deliveries.

import { useEffect, useState } from 'react';
import { Truck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';

export default function DeliveriesDashboard() {
  const [live, setLive] = useState([]);
  const [today, setToday] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const today = new Date().toISOString().split('T')[0];
    const [a, b] = await Promise.all([
      api.get('/packaging-trips/live'),
      api.get('/packaging-trips', { params: { date: today } }),
    ]);
    setLive(a.data || []);
    setToday(b.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><Truck className="w-6 h-6 text-primary" /> Deliveries</h1>
        <p className="text-sm text-muted-foreground mt-1">Live tracking of ordinary-goods delivery trips.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Active now</p>
          <p className="text-3xl font-bold text-primary mt-2">{live.length}</p>
        </div>
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Today total</p>
          <p className="text-3xl font-bold mt-2">{today.length}</p>
        </div>
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Completed today</p>
          <p className="text-3xl font-bold mt-2">{today.filter((s) => s.status === 'completed').length}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">Live trips</h2>
        {live.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl"><p className="text-sm text-muted-foreground">No active deliveries.</p></div>
        ) : (
          <div className="rounded-xl border border-rekker-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-rekker-surface">
                <tr>{['Driver','Vehicle','Team','Location','Stage','Stages','Started'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {live.map((s) => (
                  <tr key={s._id} className="border-t border-rekker-border/50">
                    <td className="px-4 py-2.5">{s.driver?.fullName}</td>
                    <td className="px-4 py-2.5 font-mono">{s.vehicle?.regNumber}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{(s.helpers || []).map(h => h.fullName).join(', ') || '—'}</td>
                    <td className="px-4 py-2.5">{s.currentLocation || '—'}</td>
                    <td className="px-4 py-2.5"><Badge variant={s.activeStage?.status === 'in_transit' ? 'warning' : 'default'}>{s.activeStage?.status || '—'}</Badge></td>
                    <td className="px-4 py-2.5 font-mono">{s.totalStages}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.dayStartTime ? formatDistanceToNow(new Date(s.dayStartTime), { addSuffix: true }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-3">All today</h2>
        {today.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl"><p className="text-sm text-muted-foreground">No trips today.</p></div>
        ) : (
          <div className="rounded-xl border border-rekker-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-rekker-surface"><tr>{['Driver','Vehicle','Status','Stages','Duration','Started','Ended'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
              ))}</tr></thead>
              <tbody>
                {today.map((s) => (
                  <tr key={s._id} className="border-t border-rekker-border/50">
                    <td className="px-4 py-2.5">{s.driver?.fullName}</td>
                    <td className="px-4 py-2.5 font-mono">{s.vehicle?.regNumber}</td>
                    <td className="px-4 py-2.5"><Badge variant={s.status === 'completed' ? 'default' : 'warning'}>{s.status}</Badge></td>
                    <td className="px-4 py-2.5 font-mono">{s.totalStages}</td>
                    <td className="px-4 py-2.5 font-mono">{s.totalDurationMinutes != null ? `${s.totalDurationMinutes}m` : '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.dayStartTime ? format(new Date(s.dayStartTime), 'HH:mm') : '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.dayEndTime ? format(new Date(s.dayEndTime), 'HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
