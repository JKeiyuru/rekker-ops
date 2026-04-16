// client/src/components/ErrorLogger.jsx

import { useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const ERROR_OPTIONS = [
  { value: 'none', label: 'None', color: 'text-muted-foreground' },
  { value: 'wrong_item', label: 'Wrong Item', color: 'text-amber-400' },
  { value: 'wrong_quantity', label: 'Wrong Qty', color: 'text-amber-400' },
  { value: 'wrong_barcode', label: 'Wrong Barcode', color: 'text-orange-400' },
  { value: 'missing_item', label: 'Missing Item', color: 'text-destructive' },
];

export default function ErrorLogger({ lpo, onUpdated, canEdit }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(lpo.errors || ['none']);
  const [notes, setNotes] = useState(lpo.notes || '');
  const [loading, setLoading] = useState(false);

  const hasErrors = lpo.errors && !lpo.errors.includes('none') && lpo.errors.length > 0;

  const toggleError = (val) => {
    if (val === 'none') {
      setSelected(['none']);
      return;
    }
    setSelected((prev) => {
      const withoutNone = prev.filter((e) => e !== 'none');
      if (withoutNone.includes(val)) {
        const next = withoutNone.filter((e) => e !== val);
        return next.length === 0 ? ['none'] : next;
      }
      return [...withoutNone, val];
    });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await api.patch(`/lpos/${lpo._id}/errors`, { errors: selected, notes });
      onUpdated(res.data);
      toast.success('Error log updated');
      setOpen(false);
    } catch {
      toast.error('Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setSelected(lpo.errors || ['none']);
    setNotes(lpo.notes || '');
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={canEdit ? handleOpen : undefined}
        className={cn(
          'flex items-center gap-1.5 text-xs font-mono rounded px-2 py-1 transition-colors',
          hasErrors
            ? 'text-destructive bg-destructive/10 hover:bg-destructive/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          !canEdit && 'cursor-default'
        )}
        title={canEdit ? 'Log errors' : 'View errors'}
      >
        {hasErrors ? (
          <>
            <AlertTriangle className="w-3 h-3" />
            {lpo.errors.filter((e) => e !== 'none').length} error{lpo.errors.filter((e) => e !== 'none').length !== 1 ? 's' : ''}
          </>
        ) : (
          <>
            <Check className="w-3 h-3 text-emerald-500" />
            Clean
          </>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Error Log — {lpo.lpoNumber}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-2">
              {ERROR_OPTIONS.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleError(opt.value)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-accent/30 text-muted-foreground hover:border-border hover:text-foreground'
                    )}
                  >
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', isSelected ? 'bg-primary' : 'bg-muted-foreground/40')} />
                    <span className={cn('text-xs', isSelected ? 'text-primary' : opt.color)}>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Notes</label>
              <Textarea
                placeholder="Additional details…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={handleSave} disabled={loading}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
