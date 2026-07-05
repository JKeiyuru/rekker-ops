// client/src/pages/fresh/FreshAlertsPage.jsx
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

export default function FreshAlertsPage() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('false');
  const load = async () => setList((await api.get('/fresh/alerts', { params: { resolved: filter } })).data);
  useEffect(() => { load(); }, [filter]);

  const resolve = async (id) => { await api.patch(`/fresh/alerts/${id}/resolve`); load(); };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display tracking-widest">FRESH ALERTS</h1>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Automatic insight feed</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={filter === 'false' ? 'default' : 'outline'} onClick={() => setFilter('false')}>Active</Button>
          <Button size="sm" variant={filter === 'true' ? 'default' : 'outline'} onClick={() => setFilter('true')}>Resolved</Button>
        </div>
      </div>
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a._id} className={cn('rounded-xl border p-4 flex items-start gap-3',
            a.severity === 'critical' ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5')}>
            <AlertTriangle className={cn('w-5 h-5 mt-0.5', a.severity === 'critical' ? 'text-destructive' : 'text-amber-500')} />
            <div className="flex-1">
              <p className="text-sm">{a.message}</p>
              <p className="text-[11px] text-muted-foreground font-mono mt-1">
                {a.channel} · {a.dateKey} · <Badge variant="outline" className="ml-1">{a.type}</Badge>
              </p>
            </div>
            {!a.resolved && <Button size="sm" variant="ghost" onClick={() => resolve(a._id)}><CheckCircle2 className="w-4 h-4 mr-1" /> Resolve</Button>}
          </div>
        ))}
        {!list.length && <p className="text-sm text-muted-foreground text-center py-10">No {filter === 'false' ? 'active' : 'resolved'} alerts.</p>}
      </div>
    </div>
  );
}
