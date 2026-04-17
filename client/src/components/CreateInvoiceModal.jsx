// client/src/components/CreateInvoiceModal.jsx

import { useState, useEffect } from 'react';
import { Loader2, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const VAT_RATE = 16; // Kenya standard

function fmt(n) {
  if (n == null || n === '') return '';
  return Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CreateInvoiceModal({ open, onClose, onCreated, prefillLpo = null }) {
  const [lpos, setLpos]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [lposLoading, setLposLoading] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedLpoId, setSelectedLpoId] = useState('');
  const [selectedLpo, setSelectedLpo]     = useState(null);
  const [amountExVat, setAmountExVat]     = useState('');
  const [amountInclVat, setAmountInclVat] = useState('');
  const [disparityReason, setDisparityReason] = useState('');
  const [date, setDate]                   = useState('');

  // Computed
  const disparity = selectedLpo?.amount != null && amountExVat !== ''
    ? Number(amountExVat) - Number(selectedLpo.amount)
    : null;
  const hasDisparity = disparity != null && Math.abs(disparity) > 0.01;

  // Auto-calculate incl VAT from ex-VAT
  const handleExVatChange = (val) => {
    setAmountExVat(val);
    if (val !== '') {
      const inclVat = Number(val) * (1 + VAT_RATE / 100);
      setAmountInclVat(inclVat.toFixed(2));
    } else {
      setAmountInclVat('');
    }
  };

  useEffect(() => {
    if (open) {
      setInvoiceNumber('');
      setAmountExVat('');
      setAmountInclVat('');
      setDisparityReason('');
      setDate(new Date().toISOString().split('T')[0]);

      if (prefillLpo) {
        setSelectedLpoId(prefillLpo._id);
        setSelectedLpo(prefillLpo);
      } else {
        setSelectedLpoId('');
        setSelectedLpo(null);
      }

      setLposLoading(true);
      api.get('/lpos/uninvoiced')
        .then((r) => setLpos(r.data))
        .finally(() => setLposLoading(false));
    }
  }, [open, prefillLpo]);

  const handleLpoSelect = (id) => {
    setSelectedLpoId(id);
    const lpo = lpos.find((l) => l._id === id);
    setSelectedLpo(lpo || null);
    // Pre-fill ex-VAT from LPO amount if available
    if (lpo?.amount != null) {
      setAmountExVat(lpo.amount.toString());
      setAmountInclVat((lpo.amount * (1 + VAT_RATE / 100)).toFixed(2));
    } else {
      setAmountExVat('');
      setAmountInclVat('');
    }
    setDisparityReason('');
  };

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) return toast.error('Invoice number required');
    if (!selectedLpoId)        return toast.error('Select an LPO');
    if (!amountExVat)          return toast.error('Amount (ex-VAT) required');
    if (!amountInclVat)        return toast.error('Amount (incl. VAT) required');
    if (hasDisparity && !disparityReason.trim())
      return toast.error('Please enter a reason for the amount disparity');

    setLoading(true);
    try {
      const res = await api.post('/invoices', {
        invoiceNumber,
        lpoId: selectedLpoId,
        amountExVat: Number(amountExVat),
        amountInclVat: Number(amountInclVat),
        vatRate: VAT_RATE,
        disparityReason: hasDisparity ? disparityReason : '',
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
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
          <DialogDescription>Link this invoice to an LPO and enter the amounts.</DialogDescription>
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

          {/* LPO selector */}
          <div className="space-y-1.5">
            <Label>Linked LPO</Label>
            {prefillLpo ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/30 bg-primary/5">
                <span className="font-mono text-sm text-primary font-semibold">{prefillLpo.lpoNumber}</span>
                <span className="text-xs text-muted-foreground">
                  {prefillLpo.branch?.name || prefillLpo.branchNameRaw || ''}
                </span>
              </div>
            ) : (
              <Select value={selectedLpoId} onValueChange={handleLpoSelect} disabled={lposLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={lposLoading ? 'Loading LPOs…' : 'Select LPO…'} />
                </SelectTrigger>
                <SelectContent>
                  {lpos.map((l) => (
                    <SelectItem key={l._id} value={l._id}>
                      <span className="font-mono">{l.lpoNumber}</span>
                      {(l.branch?.name || l.branchNameRaw) && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          — {l.branch?.name || l.branchNameRaw}
                        </span>
                      )}
                      {l.amount != null && (
                        <span className="text-muted-foreground ml-2 text-xs font-mono">
                          KES {fmt(l.amount)}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                  {!lposLoading && lpos.length === 0 && (
                    <SelectItem value="__NONE__" disabled>All LPOs are already invoiced</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}

            {/* LPO amount reference */}
            {selectedLpo?.amount != null && (
              <p className="text-xs text-muted-foreground font-mono mt-1">
                LPO Amount: <span className="text-foreground">KES {fmt(selectedLpo.amount)}</span>
              </p>
            )}
          </div>

          {/* Amount fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Invoice Amount <span className="text-muted-foreground font-normal normal-case">(excl. VAT)</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
                <Input
                  type="number" min="0" step="0.01"
                  placeholder="0.00"
                  value={amountExVat}
                  onChange={(e) => handleExVatChange(e.target.value)}
                  className="pl-10 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Invoice Amount <span className="text-muted-foreground font-normal normal-case">(incl. {VAT_RATE}% VAT)</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
                <Input
                  type="number" min="0" step="0.01"
                  placeholder="0.00"
                  value={amountInclVat}
                  onChange={(e) => setAmountInclVat(e.target.value)}
                  className="pl-10 font-mono"
                />
              </div>
              <p className="text-[11px] text-muted-foreground font-mono">Auto-calculated from ex-VAT. Edit manually if needed.</p>
            </div>
          </div>

          {/* Disparity indicator */}
          {selectedLpo?.amount != null && amountExVat !== '' && (
            <div className={cn(
              'rounded-lg border px-4 py-3 space-y-1',
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
                    ? `Disparity: KES ${fmt(Math.abs(disparity))} ${disparity > 0 ? 'over' : 'under'} LPO`
                    : 'Invoice matches LPO amount ✓'}
                </p>
              </div>

              {hasDisparity && (
                <div className="space-y-1.5 mt-2">
                  <Label className="text-amber-400/80">Reason for Disparity <span className="text-muted-foreground font-normal normal-case">(required)</span></Label>
                  <Textarea
                    placeholder="e.g. Price adjustment agreed with branch manager, additional items added on delivery…"
                    value={disparityReason}
                    onChange={(e) => setDisparityReason(e.target.value)}
                    rows={2}
                    className="border-amber-500/30 focus-visible:ring-amber-500/40 text-sm"
                  />
                </div>
              )}
            </div>
          )}

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
