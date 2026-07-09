// client/src/components/DisparityItemsEditor.jsx
//
// Compact editor for per-product disparity records on invoices.
// Value shape:  Array<{ product: string, quantity: number, unit?: string, note?: string }>
//
// UX goals:
//   • The moment the row appears there is already one empty product/qty pair,
//     so the user just types.
//   • Product = wide free-text; Qty = compact number to the right; a small "+"
//     row adds another product below; unit/note stay hidden behind a details toggle.
//
// The presence of ≥1 filled product row is treated as the reason for the disparity —
// no separate free-text reason is required from the user.

import { useEffect, useState } from 'react';
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function DisparityItemsEditor({
  value = [],
  onChange,
  disabled = false,
  compact = false,
  label = 'Products causing this disparity',
  emptyHint = 'Enter each product and its quantity. This is the reason for the disparity — no extra note needed.',
  autoSeed = true,
}) {
  const rows = Array.isArray(value) ? value : [];

  // Ensure at least one empty row exists so the user can type immediately.
  useEffect(() => {
    if (autoSeed && !disabled && rows.length === 0) {
      onChange([{ product: '', quantity: '' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const add    = () => onChange([...rows, { product: '', quantity: '' }]);

  return (
    <div className="space-y-1.5">
      {label && (
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block">
          {label}
        </span>
      )}

      {rows.length === 0 && (
        <p className="text-[11px] text-muted-foreground/70 italic px-1">{emptyHint}</p>
      )}

      <div className="space-y-1">
        {rows.map((r, i) => (
          <ProductRow
            key={i}
            row={r}
            disabled={disabled}
            compact={compact}
            onChange={(patch) => update(i, patch)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>

      <Button
        type="button" size="sm" variant="ghost" disabled={disabled}
        className="h-7 px-2 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/10"
        onClick={add}>
        <Plus className="w-3 h-3" /> Add another product
      </Button>
    </div>
  );
}

function ProductRow({ row, disabled, compact, onChange, onRemove }) {
  const [showDetails, setShowDetails] = useState(!!(row.unit || row.note));
  return (
    <div className="rounded-md border border-border/60 bg-background/50 p-1.5 space-y-1.5">
      <div className={cn('grid gap-1.5 items-center', compact ? 'grid-cols-[1fr_90px_auto_auto]' : 'grid-cols-[1fr_110px_auto_auto]')}>
        <Input
          placeholder="Product name"
          className="h-8 text-sm"
          disabled={disabled}
          value={row.product || ''}
          onChange={(e) => onChange({ product: e.target.value })}
        />
        <div className="relative">
          <Input
            type="number" step="0.01" placeholder="Qty"
            className="h-8 text-sm font-mono text-right pr-9"
            disabled={disabled}
            value={row.quantity ?? ''}
            onChange={(e) => onChange({ quantity: e.target.value })}
          />
          {row.unit && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground pointer-events-none">
              {row.unit}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          disabled={disabled}
          className="p-1 rounded hover:bg-accent/40 text-muted-foreground"
          title={showDetails ? 'Hide unit/note' : 'Add unit/note'}
        >
          {showDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {showDetails && (
        <div className="grid grid-cols-[110px_1fr] gap-1.5">
          <Input
            placeholder="Unit (e.g. cartons)"
            className="h-7 text-xs"
            disabled={disabled}
            value={row.unit || ''}
            onChange={(e) => onChange({ unit: e.target.value })}
          />
          <Input
            placeholder="Note (optional)"
            className="h-7 text-xs"
            disabled={disabled}
            value={row.note || ''}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// Compact plain-text summary used in tables and exports.
export function summarizeDisparityItems(items = []) {
  if (!items || !items.length) return '';
  return items
    .filter((it) => it && it.product && String(it.product).trim() !== '')
    .map((it) => {
      const qty = it.quantity == null || it.quantity === '' ? '?' : it.quantity;
      const unit = it.unit ? ` ${it.unit}` : '';
      const note = it.note ? ` (${it.note})` : '';
      return `${it.product} — ${qty}${unit}${note}`;
    })
    .join('; ');
}
