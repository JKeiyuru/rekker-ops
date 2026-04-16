// client/src/components/DaySection.jsx

import { useState, useEffect } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import BuyerControls from './BuyerControls';
import LPOTable from './LPOTable';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isToday(d)) return `Today — ${format(d, 'EEEE dd/MM/yyyy')}`;
  if (isYesterday(d)) return `Yesterday — ${format(d, 'EEEE dd/MM/yyyy')}`;
  return format(d, 'EEEE dd/MM/yyyy');
}

export default function DaySection({ date, lpos: initialLpos, defaultOpen = true }) {
  const { user } = useAuthStore();
  const [lpos, setLpos] = useState(initialLpos);
  const [buyerStatus, setBuyerStatus] = useState(null);
  const [open, setOpen] = useState(defaultOpen);

  const canEdit = ['super_admin', 'admin', 'team_lead'].includes(user?.role);

  useEffect(() => {
    setLpos(initialLpos);
  }, [initialLpos]);

  useEffect(() => {
    api.get(`/buyer/${date}`).then((r) => setBuyerStatus(r.data)).catch(() => {});
  }, [date]);

  const handleLPOUpdated = (updated) => {
    setLpos((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
  };

  const handleLPODeleted = (id) => {
    setLpos((prev) => prev.filter((l) => l._id !== id));
  };

  const completedCount = lpos.filter((l) => l.status === 'checked').length;
  const totalCount = lpos.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="rounded-xl border border-rekker-border overflow-hidden animate-fade-up">
      {/* Day Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 bg-rekker-surface hover:bg-accent/20 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
            <CalendarDays className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-xl tracking-widest text-foreground uppercase leading-none">
              {formatDateLabel(date)}
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {totalCount} LPO{totalCount !== 1 ? 's' : ''} &nbsp;·&nbsp; {completedCount} checked
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
          <div className="w-32 h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                pct === 100 ? 'bg-emerald-500' : 'bg-primary'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground w-9 text-right">{pct}%</span>
        </div>

        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="p-4 space-y-3 bg-background/40">
          {/* Buyer Controls */}
          <BuyerControls
            date={date}
            buyerStatus={buyerStatus}
            onUpdated={setBuyerStatus}
            canEdit={canEdit}
          />

          {/* LPO Table */}
          <LPOTable
            lpos={lpos}
            onUpdated={handleLPOUpdated}
            onDeleted={handleLPODeleted}
          />
        </div>
      )}
    </div>
  );
}
