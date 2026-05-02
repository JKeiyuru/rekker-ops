// client/src/components/CreateInvoiceModal.jsx

import { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, AlertTriangle, CheckCircle2, Search, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const VAT_RATE = 16;

function fmt(n) {
  if (n == null || n === '') return '';
  return Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── LPO Picker — searchable, grouped by date → branch ────────────────────────
function LpoPicker({ lpos, loading, selectedLpo, onSelect }) {
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});   // { 'YYYY-MM-DD': { branchName: true } }

  // Group lpos: { date → { branchName → [lpo] } }
  const grouped = useMemo(() => {
    const filtered = lpos.filter((l) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        l.lpoNumber.toLowerCase().includes(q) ||
        (l.branch?.name || l.branchNameRaw || '').toLowerCase().includes(q) ||
        (l.responsiblePerson?.name || '').toLowerCase().includes(q)
      );
    });

    const groups = {};
    filtered.forEach((lpo) => {
      const dateKey = lpo.date
        ? new Date(lpo.date).toISOString().split('T')[0]
        : 'Unknown';
      const branchKey = lpo.branch?.name || lpo.branchNameRaw || 'No Branch';
      if (!groups[dateKey]) groups[dateKey] = {};
      if (!groups[dateKey][branchKey]) groups[dateKey][branchKey] = [];
      groups[dateKey][branchKey].push(lpo);
    });
    return groups;
  }, [lpos, search]);

  const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  const toggle = (date, branch) => {
    setExpanded((prev) => ({
      ...prev,
      [date]: {
        ...(prev[date] || {}),
        [branch]: !(prev[date]?.[branch]),
      },
    }));
  };

  // Auto-expand first date/branch on load or search change
  useEffect(() => {
    if (sortedDates.length > 0) {
      const firstDate = sortedDates[0];
      const firstBranch = Object.keys(grouped[firstDate])[0];
      setExpanded({ [firstDate]: { [firstBranch]: true } });
    }
  }, [search, lpos.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (lpos.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        All LPOs have been invoiced.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search LPO number, branch, or person…"
          className="pl-9 h-8 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grouped list */}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-accent/10 divide-y divide-border">
        {sortedDates.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">No LPOs match your search.</p>
        )}
        {sortedDates.map((date) => (
          <div key={date}>
            {/* Date header */}
            <div className="px-3 py-1.5 bg-rekker-surface/60 sticky top-0">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {format(new Date(date + 'T00:00:00'), 'EEEE dd MMM yyyy')}
              </p>
            </div>

            {Object.entries(grouped[date]).map(([branchName, branchLpos]) => {
              const isOpen = !!(expanded[date]?.[branchName]);
              return (
                <div key={branchName}>
                  {/* Branch sub-header */}
                  <button
                    type="button"
                    onClick={() => toggle(date, branchName)}
                    className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-accent/30 transition-colors text-left"
                  >
                    {isOpen
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className="text-xs font-medium text-foreground">{branchName}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] py-0 h-4">
                      {branchLpos.length}
                    </Badge>
                  </button>

                  {/* LPO rows */}
                  {isOpen && branchLpos.map((lpo) => {
                    const isSelected = selectedLpo?._id === lpo._id;
                    return (
                      <button
                        key={lpo._id}
                        type="button"
                        onClick={() => onSelect(lpo)}
                        className={cn(
                          'w-full flex items-center justify-between px-6 py-2 text-left transition-colors text-sm',
                          isSelected
                            ? 'bg-primary/15 text-primary'
                            : 'hover:bg-accent/40 text-foreground'
                        )}
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-xs tracking-wider">
                            {lpo.lpoNumber}
                          </span>
                          {lpo.responsiblePerson?.name && (
                            <span className="text-muted-foreground text-[11px] ml-2">
                              — {lpo.responsiblePerson.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {lpo.amount != null && (
                            <span className="text-[11px] font-mono text-muted-foreground">
                              KES {fmt(lpo.amount)}
                            </span>
                          )}
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected display */}
      {selectedLpo && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-mono font-semibold text-primary">{selectedLpo.lpoNumber}</span>
          {(selectedLpo.branch?.name || selectedLpo.branchNameRaw) && (
            <span className="text-muted-foreground">
              — {selectedLpo.branch?.name || selectedLpo.branchNameRaw}
            </span>
          )}
          {selectedLpo.amount != null && (
            <span className="ml-auto font-mono text-muted-foreground">
              LPO: KES {fmt(selectedLpo.amount)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function CreateInvoiceModal({ open, onClose, onCreated, prefillLpo = null }) {
  const [lpos, setLpos]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [lposLoading, setLposLoading] = useState(false);

  const [invoiceNumber, setInvoiceNumber]   = useState('');
  const [selectedLpo, setSelectedLpo]       = useState(null);
  const [amountExVat, setAmountExVat]       = useState('');
  const [amountInclVat, setAmountInclVat]   = useState('');
  const [disparityReason, setDisparityReason] = useState('');
  const [deliveredBy, setDeliveredBy]       = useState('');
  const [date, setDate]                     = useState('');

  // Computed disparity
  const disparity = selectedLpo?.amount != null && amountExVat !== ''
    ? Number(amountExVat) - Number(selectedLpo.amount)
    : null;
  const hasDisparity = disparity != null && Math.abs(disparity) > 0.01;

  const handleExVatChange = (val) => {
    setAmountExVat(val);
    if (val !== '') {
      setAmountInclVat((Number(val) * (1 + VAT_RATE / 100)).toFixed(2));
    } else {
      setAmountInclVat('');
    }
  };

  const handleLpoSelect = (lpo) => {
    setSelectedLpo(lpo);
    setDisparityReason('');
    if (lpo?.amount != null) {
      setAmountExVat(String(lpo.amount));
      setAmountInclVat((lpo.amount * (1 + VAT_RATE / 100)).toFixed(2));
    } else {
      setAmountExVat('');
      setAmountInclVat('');
    }
  };

  useEffect(() => {
    if (open) {
      setInvoiceNumber('');
      setAmountExVat('');
      setAmountInclVat('');
      setDisparityReason('');
      setDeliveredBy('');
      setDate(new Date().toISOString().split('T')[0]);

      if (prefillLpo) {
        setSelectedLpo(prefillLpo);
        if (prefillLpo.amount != null) {
          setAmountExVat(String(prefillLpo.amount));
          setAmountInclVat((prefillLpo.amount * (1 + VAT_RATE / 100)).toFixed(2));
        }
      } else {
        setSelectedLpo(null);
      }

      setLposLoading(true);
      api.get('/lpos/uninvoiced')
        .then((r) => setLpos(Array.isArray(r.data) ? r.data : []))
        .finally(() => setLposLoading(false));
    }
  }, [open, prefillLpo]);

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) return toast.error('Invoice number required');
    if (!selectedLpo)          return toast.error('Select an LPO');
    if (!amountExVat)          return toast.error('Amount (ex-VAT) required');
    if (!amountInclVat)        return toast.error('Amount (incl. VAT) required');
    if (hasDisparity && !disparityReason.trim())
      return toast.error('Please enter a reason for the disparity');

    setLoading(true);
    try {
      const res = await api.post('/invoices', {
        invoiceNumber,
        lpoId:          selectedLpo._id,
        amountExVat:    Number(amountExVat),
        amountInclVat:  Number(amountInclVat),
        vatRate:        VAT_RATE,
        disparityReason: hasDisparity ? disparityReason : '',
        deliveredBy,
        date,
      });
      toast.success(`Invoice ${res.data.invoiceNumber} created!`);
      onCreated(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
          <DialogDescription>
            Select an LPO then enter the invoice amounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Invoice Number + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice Number</Label>
              <Input
                placeholder="e.g. INV-001"
                className="font-mono uppercase"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* LPO Picker */}
          <div className="space-y-1.5">
            <Label>Linked LPO</Label>
            {prefillLpo ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/30 bg-primary/5">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-sm text-primary font-semibold">{prefillLpo.lpoNumber}</span>
                <span className="text-xs text-muted-foreground">
                  {prefillLpo.branch?.name || prefillLpo.branchNameRaw || ''}
                </span>
              </div>
            ) : (
              <LpoPicker
                lpos={lpos}
                loading={lposLoading}
                selectedLpo={selectedLpo}
                onSelect={handleLpoSelect}
              />
            )}
          </div>

          {/* LPO amount reference */}
          {selectedLpo?.amount != null && (
            <p className="text-xs text-muted-foreground font-mono -mt-1">
              LPO Amount: <span className="text-foreground font-medium">KES {fmt(selectedLpo.amount)}</span>
              {selectedLpo.responsiblePerson?.name && (
                <span className="ml-3">
                  Prepared by: <span className="text-foreground">{selectedLpo.responsiblePerson.name}</span>
                </span>
              )}
            </p>
          )}

          {/* Amount fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice Amount <span className="text-muted-foreground font-normal normal-case">(excl. VAT)</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={amountExVat}
                  onChange={(e) => handleExVatChange(e.target.value)}
                  className="pl-10 font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Amount <span className="text-muted-foreground font-normal normal-case">(incl. {VAT_RATE}% VAT)</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={amountInclVat}
                  onChange={(e) => setAmountInclVat(e.target.value)}
                  className="pl-10 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Delivered By */}
          <div className="space-y-1.5">
            <Label>Delivered By <span className="text-muted-foreground font-normal normal-case">(optional)</span></Label>
            <Input
              placeholder="Name of delivery person…"
              value={deliveredBy}
              onChange={(e) => setDeliveredBy(e.target.value)}
            />
          </div>

          {/* Disparity indicator */}
          {selectedLpo?.amount != null && amountExVat !== '' && (
            <div className={cn(
              'rounded-lg border px-4 py-3 space-y-2',
              hasDisparity
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5'
            )}>
              <div className="flex items-center gap-2">
                {hasDisparity
                  ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                <p className={cn('text-sm font-medium', hasDisparity ? 'text-amber-300' : 'text-emerald-400')}>
                  {hasDisparity
                    ? `Disparity: KES ${fmt(Math.abs(disparity))} ${disparity > 0 ? 'over' : 'under'} LPO amount`
                    : 'Invoice matches LPO amount ✓'}
                </p>
              </div>
              {hasDisparity && (
                <div className="space-y-1.5">
                  <Label className="text-amber-400/80">
                    Reason for Disparity <span className="text-muted-foreground font-normal">(required)</span>
                  </Label>
                  <Textarea
                    placeholder="e.g. Price adjustment agreed with branch manager…"
                    value={disparityReason}
                    onChange={(e) => setDisparityReason(e.target.value)}
                    rows={2}
                    className="border-amber-500/30 focus-visible:ring-amber-500/40 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="button" className="flex-1" disabled={loading} onClick={handleSubmit}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Invoice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
