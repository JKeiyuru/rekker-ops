// client/src/components/UniversalFilterBar.jsx
// Shared filter bar for reports: date range + multi-branch select.

import { useEffect, useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export default function UniversalFilterBar({ value, onChange, showBranches = true }) {
  const [branches, setBranches] = useState([]);
  useEffect(() => {
    if (showBranches) api.get('/branches').then((r) => setBranches(r.data || [])).catch(() => {});
  }, [showBranches]);

  const set = (patch) => onChange({ ...value, ...patch });
  const toggleBranch = (id) => {
    const set$ = new Set(value.branches || []);
    if (set$.has(id)) set$.delete(id); else set$.add(id);
    set({ branches: Array.from(set$) });
  };

  const preset = (kind) => {
    const today = new Date();
    let start = new Date();
    if (kind === 'today')    start = today;
    if (kind === 'week')     start.setDate(today.getDate() - 6);
    if (kind === 'month')    start.setDate(today.getDate() - 29);
    if (kind === 'quarter')  start.setDate(today.getDate() - 89);
    set({
      startDate: start.toISOString().split('T')[0],
      endDate:   today.toISOString().split('T')[0],
    });
  };

  return (
    <div className="p-4 rounded-xl border border-rekker-border bg-rekker-surface space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <Input type="date" className="h-8 w-36 text-sm" value={value.startDate || ''}
          onChange={(e) => set({ startDate: e.target.value })} />
        <span className="text-xs font-mono text-muted-foreground">→</span>
        <Input type="date" className="h-8 w-36 text-sm" value={value.endDate || ''}
          onChange={(e) => set({ endDate: e.target.value })} />
        {['today', 'week', 'month', 'quarter'].map((k) => (
          <Button key={k} size="sm" variant="ghost" className="h-7 px-2 text-xs uppercase"
            onClick={() => preset(k)}>{k}</Button>
        ))}
        {(value.startDate || value.endDate || (value.branches || []).length > 0) && (
          <Button variant="ghost" size="sm" className="ml-auto text-xs"
            onClick={() => onChange({ startDate: '', endDate: '', branches: [] })}>
            <X className="w-3 h-3" /> Clear
          </Button>
        )}
      </div>

      {showBranches && branches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground self-center mr-1">Branches:</span>
          {branches.map((b) => {
            const active = (value.branches || []).includes(b._id);
            return (
              <button key={b._id} type="button" onClick={() => toggleBranch(b._id)}
                className={cn('text-xs px-2 py-1 rounded-md border transition-colors',
                  active
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground')}>
                {b.name}
              </button>
            );
          })}
          {(value.branches || []).length > 0 && (
            <Badge variant="outline" className="text-[9px]">{value.branches.length} selected</Badge>
          )}
        </div>
      )}
    </div>
  );
}
