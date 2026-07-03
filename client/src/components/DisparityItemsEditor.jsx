// client/src/components/DisparityItemsEditor.jsx
//
// Compact editor for structured per-product disparity records on invoices.
// Value shape:  Array<{ product: string, quantity: number, unit?: string, note?: string }>
//
// Renders as a small stacked list with "+ Add product" — no modal, no popover,
// so it works inline in both single-invoice and batch-invoice screens.

import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function DisparityItemsEditor({
  value = [],
  onChange,
  disabled = false,
  compact = false,
  label = 'Products causing this disparity',
  emptyHint = 'Add each product + quantity that caused the mismatch. This feeds the Disparity Product Report.',
}) {
  const rows = Array.isArray(value) ? value : [];

  const update = (i, patch) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { product: '', quantity: '', unit: '', note: '' }]);

  return (
    <div className={cn('space-y-1.5', compact && 'space-y-1')}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Button
            type="button" size="sm" variant="ghost" disabled={disabled}
            className="h-6 px-1.5 text-[11px] gap-1"
            onClick={add}>
            <Plus className="w-3 h-3" /> Add product
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/70 italic px-1">{emptyHint}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div
              key={i}
              className={cn(
                'grid gap-1.5 items-center',
                compact
                  ? 'grid-cols-[1fr_70px_60px_auto]'
                  : 'grid-cols-[1.4fr_80px_70px_1.4fr_auto]'
              )}
            >
              <Input
                placeholder="Product name"
                className="h-7 text-xs"
                disabled={disabled}
                value={r.product || ''}
                onChange={(e) => update(i, { product: e.target.value })}
              />
              <Input
                type="number" step="0.01" placeholder="Qty"
                className="h-7 text-xs font-mono text-right"
                disabled={disabled}
                value={r.quantity ?? ''}
                onChange={(e) => update(i, { quantity: e.target.value })}
              />
              <Input
                placeholder="Unit"
                className="h-7 text-xs"
                disabled={disabled}
                value={r.unit || ''}
                onChange={(e) => update(i, { unit: e.target.value })}
              />
              {!compact && (
                <Input
                  placeholder="Note (optional)"
                  className="h-7 text-xs"
                  disabled={disabled}
                  value={r.note || ''}
                  onChange={(e) => update(i, { note: e.target.value })}
                />
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                title="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Turn saved rows into a compact plain-text label used in tables/exports.
export function summarizeDisparityItems(items = []) {
  if (!items || !items.length) return '';
  return items
    .map((it) => {
      const qty = it.quantity == null || it.quantity === '' ? '?' : it.quantity;
      const unit = it.unit ? ` ${it.unit}` : '';
      const note = it.note ? ` (${it.note})` : '';
      return `${it.product} — ${qty}${unit}${note}`;
    })
    .join('; ');
}
