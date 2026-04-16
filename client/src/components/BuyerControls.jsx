// client/src/components/BuyerControls.jsx

import { useState } from 'react';
import { Truck, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

export default function BuyerControls({ date, buyerStatus, onUpdated, canEdit }) {
  const [loading, setLoading] = useState(null);

  const handleDispatch = async () => {
    setLoading('dispatch');
    try {
      const res = await api.post('/buyer/dispatch', { date });
      onUpdated(res.data);
      toast.success('Buyer dispatched!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(null);
    }
  };

  const handleReturn = async () => {
    setLoading('return');
    try {
      const res = await api.post('/buyer/return', { date });
      onUpdated(res.data);
      toast.success('Buyer marked as returned!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(null);
    }
  };

  const dispatched = buyerStatus?.dispatchedAt;
  const returned = buyerStatus?.returnedAt;

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg border border-rekker-border bg-rekker-surface/50">
      <div className="flex items-center gap-2">
        <Truck className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Buyer Status</span>
      </div>

      {/* Status display */}
      <div className="flex items-center gap-4 flex-1 flex-wrap">
        {dispatched ? (
          <div className="flex items-center gap-2">
            <span className={cn(
              'status-pill',
              returned ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', returned ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse_dot')} />
              {returned ? 'Returned' : 'Dispatched'}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              <Clock className="w-3 h-3 inline mr-1 opacity-60" />
              {dispatched && format(new Date(dispatched), 'HH:mm')}
              {returned && ` → ${format(new Date(returned), 'HH:mm')}`}
            </span>
          </div>
        ) : (
          <span className="status-pill bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Not dispatched
          </span>
        )}
      </div>

      {/* Action buttons */}
      {canEdit && (
        <div className="flex gap-2">
          {!dispatched && (
            <Button size="sm" variant="warning" onClick={handleDispatch} disabled={!!loading}>
              {loading === 'dispatch' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
              Dispatch Buyer
            </Button>
          )}
          {dispatched && !returned && (
            <Button size="sm" variant="success" onClick={handleReturn} disabled={!!loading}>
              {loading === 'return' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Mark Returned
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
