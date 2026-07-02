// client/src/pages/InvoicePage.jsx

import { useEffect, useState, useCallback } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Plus, RefreshCw, Loader2, Search, FileCheck, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  CalendarDays, Receipt, Send, ThumbsUp, ThumbsDown,
  Download, Edit2, Trash2, Pencil, Save, X, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—';
  return `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isToday(d))     return `Today — ${format(d, 'EEEE dd/MM/yyyy')}`;
  if (isYesterday(d)) return `Yesterday — ${format(d, 'EEEE dd/MM/yyyy')}`;
  return format(d, 'EEEE dd/MM/yyyy');
}

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     variant: 'pending',      icon: Clock        },
  submitted: { label: 'Submitted', variant: 'warning',      icon: Send         },
  approved:  { label: 'Approved',  variant: 'success',      icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  variant: 'destructive',  icon: XCircle      },
};

function InvoiceStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ── Reject Dialog ─────────────────────────────────────────────────────────────
function RejectDialog({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject Invoice</DialogTitle>
          <DialogDescription>Provide a reason for rejection.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Textarea
            placeholder="Explain why this invoice is rejected…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" className="flex-1"
              onClick={() => { onConfirm(reason); onClose(); }}
              disabled={!reason.trim()}>
              Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tax picker used inside the edit modal ────────────────────────────────────
const VAT_RATE = 16;
function editComputeTax({ amountExVat, taxMode, exemptAmount, overrideTaxAmount }) {
  const sub = Number(amountExVat) || 0;
  let exempt = Number(exemptAmount) || 0;
  let override = Number(overrideTaxAmount) || 0;
  if (taxMode === 'taxable') { exempt = 0; override = 0; }
  else if (taxMode === 'exempt') { exempt = sub; override = 0; }
  else if (taxMode === 'override') { exempt = 0; if (override < 0) override = 0; }
  else { override = 0; if (exempt < 0) exempt = 0; if (exempt > sub) exempt = sub; }
  const taxable = taxMode === 'override' ? sub : sub - exempt;
  const vat     = taxMode === 'override' ? override : taxable * (VAT_RATE / 100);
  const incl    = taxMode === 'override' ? sub + override : taxable + vat + exempt;
  return { taxable, exempt, vat, incl };
}

// ── Edit Invoice Dialog (packaging team lead+) ───────────────────────────────
function EditInvoiceDialog({ open, onClose, invoice, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [lpoOptions, setLpoOptions] = useState([]);
  const [form, setForm] = useState({
    invoiceNumber: '', amountExVat: '', deliveredBy: '', disparityReason: '',
    date: '', lpoId: '', taxMode: 'taxable', exemptAmount: '', overrideTaxAmount: '',
    returns: '',
  });

  useEffect(() => {
    if (invoice && open) {
      setForm({
        invoiceNumber:     invoice.invoiceNumber || '',
        amountExVat:       invoice.amountExVat != null ? String(invoice.amountExVat) : '',
        deliveredBy:       invoice.deliveredBy || '',
        disparityReason:   invoice.disparityReason || '',
        date:              invoice.date ? new Date(invoice.date).toISOString().split('T')[0] : '',
        lpoId:             invoice.lpo?._id || invoice.lpo || '',
        taxMode:           invoice.taxMode || 'taxable',
        exemptAmount:      invoice.exemptAmount != null ? String(invoice.exemptAmount) : '',
        overrideTaxAmount: invoice.overrideTaxAmount != null ? String(invoice.overrideTaxAmount) : '',
        returns:           invoice.returns || '',
      });
      // Load available LPOs for re-linking (uninvoiced + this invoice's own LPO)
      api.get('/lpos/uninvoiced').then((r) => {
        const list = r.data || [];
        if (invoice.lpo && !list.find((l) => l._id === (invoice.lpo._id || invoice.lpo))) {
          list.unshift(invoice.lpo);
        }
        setLpoOptions(list);
      }).catch(() => {});
    }
  }, [invoice, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: typeof e === 'string' ? e : e.target.value }));
  const tax = editComputeTax(form);

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        invoiceNumber:     form.invoiceNumber,
        amountExVat:       Number(form.amountExVat),
        deliveredBy:       form.deliveredBy,
        disparityReason:   form.disparityReason,
        date:              form.date,
        lpoId:             form.lpoId,
        taxMode:           form.taxMode,
        exemptAmount:      form.taxMode === 'mixed' ? Number(form.exemptAmount) || 0 : 0,
        overrideTaxAmount: form.taxMode === 'override' ? Number(form.overrideTaxAmount) || 0 : 0,
        returns:           form.returns,
      };
      const res = await api.put(`/invoices/${invoice._id}`, payload);
      onUpdated(res.data);
      toast.success('Invoice updated — totals recalculated');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Invoice</DialogTitle>
          <DialogDescription>All changes are audited. Disparity, VAT, and adjusted amount are recalculated automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice Number</Label>
              <Input className="font-mono uppercase" value={form.invoiceNumber} onChange={set('invoiceNumber')} />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" value={form.date} onChange={set('date')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Linked LPO</Label>
            <Select value={form.lpoId} onValueChange={set('lpoId')}>
              <SelectTrigger><SelectValue placeholder="Select LPO…" /></SelectTrigger>
              <SelectContent>
                {lpoOptions.map((l) => (
                  <SelectItem key={l._id} value={l._id}>
                    {l.lpoNumber} {l.branch?.name ? `— ${l.branch.name}` : ''} {l.amount != null ? `· KES ${fmtShort(l.amount)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount ex-VAT</Label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
                <Input type="number" step="0.01" className="pl-9 font-mono" value={form.amountExVat} onChange={set('amountExVat')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Delivered By</Label>
              <Input value={form.deliveredBy} onChange={set('deliveredBy')} />
            </div>
          </div>

          {/* Tax picker (4 modes) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tax Treatment</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { v: 'taxable',  l: 'Taxable',  s: '+16%' },
                { v: 'exempt',   l: 'Exempt',   s: 'No VAT' },
                { v: 'mixed',    l: 'Mixed',    s: 'Exempt val' },
                { v: 'override', l: 'Set VAT',  s: 'Direct' },
              ].map((o) => (
                <button key={o.v} type="button" onClick={() => set('taxMode')(o.v)}
                  className={cn('px-2 py-1.5 rounded-md border text-left',
                    form.taxMode === o.v ? 'border-primary bg-primary/10 text-primary'
                                         : 'border-border text-muted-foreground hover:text-foreground')}>
                  <p className="text-xs font-semibold">{o.l}</p>
                  <p className="text-[10px] opacity-80">{o.s}</p>
                </button>
              ))}
            </div>
            {form.taxMode === 'mixed' && (
              <div className="relative pt-1">
                <span className="absolute left-2 top-[calc(50%+2px)] -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
                <Input type="number" step="0.01" placeholder="Value of tax-exempt goods"
                  className="pl-9 h-8 text-sm font-mono" value={form.exemptAmount} onChange={set('exemptAmount')} />
              </div>
            )}
            {form.taxMode === 'override' && (
              <div className="relative pt-1">
                <span className="absolute left-2 top-[calc(50%+2px)] -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
                <Input type="number" step="0.01" placeholder="Tax amount"
                  className="pl-9 h-8 text-sm font-mono" value={form.overrideTaxAmount} onChange={set('overrideTaxAmount')} />
              </div>
            )}
            <p className="text-[10px] text-muted-foreground font-mono">
              Incl. VAT (recomputed): <span className="text-foreground">{fmt(tax.incl)}</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Disparity Reason</Label>
            <Textarea rows={2} value={form.disparityReason} onChange={set('disparityReason')}
              placeholder="Optional — recorded when invoice ≠ LPO amount"/>
          </div>

          <div className="space-y-1.5">
            <Label>Returns Note (legacy free-text)</Label>
            <Textarea rows={2} value={form.returns} onChange={set('returns')}
              placeholder="For structured returns use the Adjustments dialog." />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Adjustments Dialog ───────────────────────────────────────────────────────
const ADJ_LABELS = {
  returned_goods: 'Returned Goods',
  not_delivered:  'Not Delivered',
  control_list:   'Control List',
  other:          'Other',
};

function AdjustmentsDialog({ open, onClose, invoice, onUpdated, canEdit }) {
  const [type, setType] = useState('returned_goods');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const adjustments = invoice?.adjustments || [];
  const total = adjustments.reduce((s, a) => s + Number(a.amount || 0), 0);

  const add = async () => {
    if (!amount || Number(amount) <= 0) return toast.error('Enter an amount');
    setBusy(true);
    try {
      const res = await api.post(`/invoices/${invoice._id}/adjustments`, {
        type, amount: Number(amount), reason,
      });
      onUpdated(res.data);
      setAmount(''); setReason('');
      toast.success('Adjustment added');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add');
    } finally { setBusy(false); }
  };

  const remove = async (adjId) => {
    if (!window.confirm('Remove this adjustment?')) return;
    try {
      const res = await api.delete(`/invoices/${invoice._id}/adjustments/${adjId}`);
      onUpdated(res.data);
      toast.success('Adjustment removed');
    } catch { toast.error('Failed to remove'); }
  };

  if (!invoice) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Adjustments — {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>
            Original amount stays immutable for audit. Adjusted total is amount − Σ adjustments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2 text-xs font-mono">
          <div className="flex justify-between"><span className="text-muted-foreground">Original (incl. VAT)</span><span>{fmt(invoice.amountInclVat)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Adjustments total</span><span className="text-amber-400">−{fmt(total)}</span></div>
          <div className="flex justify-between text-sm pt-1 border-t border-border"><span>Adjusted</span><span className="font-semibold">{fmt(invoice.adjustedAmount ?? invoice.amountInclVat)}</span></div>
        </div>

        {adjustments.length > 0 && (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {adjustments.map((a) => (
              <div key={a._id} className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">{ADJ_LABELS[a.type] || a.type}</Badge>
                    <span className="font-mono text-xs">{fmt(a.amount)}</span>
                  </div>
                  {a.reason && <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{a.reason}</p>}
                </div>
                {canEdit && (
                  <button onClick={() => remove(a._id)} className="text-muted-foreground hover:text-destructive p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Add adjustment</p>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ADJ_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
              <Input type="number" step="0.01" placeholder="Amount"
                className="pl-9 h-8 font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button className="w-full" size="sm" onClick={add} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add adjustment
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Returns inline editor ─────────────────────────────────────────────────────
function ReturnsCell({ invoice, onUpdated, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(invoice.returns || '');
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/invoices/${invoice._id}/returns`, { returns: value });
      onUpdated(res.data);
      setEditing(false);
      toast.success('Returns updated');
    } catch {
      toast.error('Failed to update returns');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-start gap-1 min-w-[140px]">
        <Textarea
          className="text-xs h-16 min-h-0 resize-none"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          </button>
          <button onClick={() => { setEditing(false); setValue(invoice.returns || ''); }}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-1 group min-w-[100px]',
        canEdit && 'cursor-pointer'
      )}
      onClick={() => canEdit && setEditing(true)}
    >
      <span className="text-xs text-foreground flex-1 whitespace-pre-wrap break-words max-w-[140px]">
        {invoice.returns || <span className="text-muted-foreground/50 italic text-[11px]">None</span>}
      </span>
      {canEdit && (
        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
      )}
    </div>
  );
}

// ── Invoice Row ───────────────────────────────────────────────────────────────
function InvoiceRow({ invoice, onUpdated, onDeleted, isAdmin, canEdit, i }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [rejectOpen, setRejectOpen]       = useState(false);
  const [editOpen, setEditOpen]           = useState(false);
  const [adjOpen, setAdjOpen]             = useState(false);

  const doAction = async (action, extra = {}) => {
    setLoadingAction(action);
    try {
      const res = await api.patch(`/invoices/${invoice._id}/status`, { action, ...extra });
      onUpdated(res.data);
      const labels = { submit: 'Submitted', approve: 'Approved', reject: 'Rejected' };
      toast.success(`Invoice ${labels[action] || action}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return;
    try {
      await api.delete(`/invoices/${invoice._id}`);
      onDeleted(invoice._id);
      toast.success('Invoice deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const hasDisparity = invoice.disparityAmount != null && Math.abs(invoice.disparityAmount) > 0.01;
  // "Prepared by" = the responsible person on the LPO
  const preparedBy = invoice.lpo?.responsiblePerson?.name || '—';

  return (
    <>
      <tr className={cn(
        'border-b border-rekker-border/50 hover:bg-accent/20 transition-colors align-top',
        i % 2 !== 0 && 'bg-rekker-surface/20'
      )}>
        {/* Invoice No. + edited badge */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs font-semibold text-primary tracking-wider">
              {invoice.invoiceNumber}
            </span>
            {invoice.isEdited && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[9px] font-mono text-amber-400 cursor-help">edited</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Last edited {invoice.editedAt ? format(new Date(invoice.editedAt), 'dd/MM/yy HH:mm') : ''}
                    {invoice.editedBy?.fullName ? ` by ${invoice.editedBy.fullName}` : ''}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </td>

        {/* LPO No. */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="font-mono text-xs text-foreground">{invoice.lpoNumber || invoice.lpo?.lpoNumber || '—'}</span>
        </td>

        {/* Branch */}
        <td className="px-3 py-3 text-xs text-foreground whitespace-nowrap">
          {invoice.branch?.name || invoice.branchNameRaw || '—'}
        </td>

        {/* LPO Amount */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="font-mono text-xs text-muted-foreground">
            {invoice.lpo?.amount != null ? `KES ${fmtShort(invoice.lpo.amount)}` : '—'}
          </span>
        </td>

        {/* Invoice ex-VAT */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="font-mono text-xs text-foreground">{fmt(invoice.amountExVat)}</span>
        </td>

        {/* Invoice incl-VAT */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-foreground">{fmt(invoice.amountInclVat)}</span>
            {invoice.taxMode === 'exempt' && (
              <Badge variant="outline" className="text-[9px] py-0 h-4 border-blue-500/40 text-blue-400">EXEMPT</Badge>
            )}
            {invoice.taxMode === 'mixed' && invoice.exemptAmount > 0 && (
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] py-0 h-4 border-amber-500/40 text-amber-400 cursor-help">MIXED</Badge>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  Exempt portion: KES {fmtShort(invoice.exemptAmount)} <br />
                  Taxable: KES {fmtShort((invoice.amountExVat || 0) - (invoice.exemptAmount || 0))}
                </TooltipContent>
              </Tooltip></TooltipProvider>
            )}
          </div>
        </td>

        {/* Disparity */}
        <td className="px-3 py-3 whitespace-nowrap">
          {hasDisparity ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className={cn('font-mono text-xs font-semibold',
                      invoice.disparityAmount > 0 ? 'text-amber-400' : 'text-destructive')}>
                      {invoice.disparityAmount > 0 ? '+' : ''}{fmtShort(invoice.disparityAmount)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-0.5">Reason:</p>
                  <p>{invoice.disparityReason || 'No reason provided'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-xs font-mono">Match</span>
            </div>
          )}
        </td>

        {/* Disparity Reason (with expand-on-click) */}
        <td className="px-3 py-3 max-w-[180px]">
          {invoice.disparityReason ? (
            <TooltipProvider><Tooltip>
              <TooltipTrigger asChild>
                <p className="text-[11px] text-foreground line-clamp-2 cursor-help whitespace-pre-wrap break-words">
                  {invoice.disparityReason}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-md text-xs whitespace-pre-wrap break-words">
                {invoice.disparityReason}
              </TooltipContent>
            </Tooltip></TooltipProvider>
          ) : (
            <span className="text-muted-foreground/50 italic text-[11px]">—</span>
          )}
        </td>

        {/* Adjustments — original vs adjusted */}
        <td className="px-3 py-3 whitespace-nowrap">
          {(() => {
            const adjs = invoice.adjustments || [];
            const total = adjs.reduce((s, a) => s + Number(a.amount || 0), 0);
            if (!adjs.length) {
              return (
                <button onClick={() => canEdit && setAdjOpen(true)}
                  className={cn('text-[11px] font-mono text-muted-foreground/60 italic', canEdit && 'hover:text-primary')}>
                  none
                </button>
              );
            }
            const types = [...new Set(adjs.map((a) => a.type))];
            return (
              <button onClick={() => setAdjOpen(true)} className="flex flex-col items-start gap-0.5 hover:text-primary">
                <span className="text-xs font-mono text-amber-400">−{fmtShort(total)}</span>
                <span className="text-[9px] font-mono text-foreground">→ {fmtShort(invoice.adjustedAmount ?? invoice.amountInclVat)}</span>
                <div className="flex flex-wrap gap-0.5">
                  {types.map((t) => (
                    <Badge key={t} variant="outline" className="text-[8px] py-0 h-3.5">{ADJ_LABELS[t] || t}</Badge>
                  ))}
                </div>
              </button>
            );
          })()}
        </td>
        <td className="px-3 py-3 whitespace-nowrap text-xs text-foreground">{preparedBy}</td>

        {/* Delivered By */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-foreground">{invoice.deliveredBy || <span className="text-muted-foreground/50 italic text-[11px]">—</span>}</span>
        </td>

        {/* Returns — always editable inline */}
        <td className="px-3 py-3">
          <ReturnsCell invoice={invoice} onUpdated={onUpdated} canEdit={canEdit} />
        </td>

        {/* Status */}
        <td className="px-3 py-3 whitespace-nowrap"><InvoiceStatusBadge status={invoice.status} /></td>

        {/* Actions */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1 flex-nowrap">
            {/* Submit */}
            {invoice.status === 'draft' && canEdit && (
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="default" className="h-7 px-2.5"
                    disabled={!!loadingAction}
                    onClick={() => doAction('submit')}>
                    {loadingAction === 'submit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Submit for approval</TooltipContent>
              </Tooltip></TooltipProvider>
            )}
            {/* Approve */}
            {invoice.status === 'submitted' && isAdmin && (
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="success" className="h-7 px-2.5"
                    disabled={!!loadingAction}
                    onClick={() => doAction('approve')}>
                    {loadingAction === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Approve</TooltipContent>
              </Tooltip></TooltipProvider>
            )}
            {/* Reject */}
            {invoice.status === 'submitted' && isAdmin && (
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="destructive" className="h-7 px-2.5"
                    disabled={!!loadingAction}
                    onClick={() => setRejectOpen(true)}>
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reject</TooltipContent>
              </Tooltip></TooltipProvider>
            )}
            {/* Rejection reason tooltip */}
            {invoice.status === 'rejected' && invoice.rejectionReason && (
              <TooltipProvider><Tooltip>
                <TooltipTrigger>
                  <XCircle className="w-4 h-4 text-destructive cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-0.5">Rejection reason:</p>
                  <p>{invoice.rejectionReason}</p>
                </TooltipContent>
              </Tooltip></TooltipProvider>
            )}
            {/* Adjustments (any role that can edit) */}
            {canEdit && (
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 px-2"
                    onClick={() => setAdjOpen(true)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Adjustments (returns / not delivered / other)</TooltipContent>
              </Tooltip></TooltipProvider>
            )}
            {/* Edit (packaging team lead+) */}
            {canEdit && (
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 px-2"
                    onClick={() => setEditOpen(true)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit invoice</TooltipContent>
              </Tooltip></TooltipProvider>
            )}
            {/* Delete (admin) */}
            {isAdmin && (
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost"
                    className="h-7 px-2 hover:text-destructive hover:bg-destructive/10"
                    onClick={handleDelete}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete invoice</TooltipContent>
              </Tooltip></TooltipProvider>
            )}
          </div>
        </td>
      </tr>

      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => doAction('reject', { rejectionReason: reason })} />

      <EditInvoiceDialog open={editOpen} onClose={() => setEditOpen(false)}
        invoice={invoice} onUpdated={onUpdated} />

      <AdjustmentsDialog open={adjOpen} onClose={() => setAdjOpen(false)}
        invoice={invoice} onUpdated={onUpdated} canEdit={canEdit} />
    </>
  );
}

// ── Day Section ───────────────────────────────────────────────────────────────
const HEADERS = [
  'Invoice No.', 'LPO No.', 'Branch', 'LPO Amount',
  'Ex-VAT', 'Incl. VAT', 'Disparity', 'Disparity Reason', 'Adjustments',
  'Prepared By', 'Delivered By', 'Returns', 'Status', 'Actions',
];

function InvoiceDaySection({ date, invoices: init, onUpdated, onDeleted, isAdmin, canEdit, defaultOpen }) {
  const [invoices, setInvoices] = useState(init);
  const [open, setOpen]         = useState(defaultOpen);

  useEffect(() => { setInvoices(init); }, [init]);

  const handleUpdated = (updated) => {
    setInvoices((prev) => prev.map((inv) => (inv._id === updated._id ? updated : inv)));
    onUpdated(updated);
  };
  const handleDeleted = (id) => {
    setInvoices((prev) => prev.filter((inv) => inv._id !== id));
    onDeleted(id);
  };

  const totalExVat   = invoices.reduce((s, i) => s + (i.amountExVat || 0), 0);
  const totalInclVat = invoices.reduce((s, i) => s + (i.amountInclVat || 0), 0);
  const withDisparity = invoices.filter((i) => i.disparityAmount != null && Math.abs(i.disparityAmount) > 0.01).length;

  return (
    <div className="rounded-xl border border-rekker-border overflow-hidden animate-fade-up">
      {/* Header */}
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 bg-rekker-surface hover:bg-accent/20 transition-colors text-left">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
          <CalendarDays className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-xl tracking-widest text-foreground uppercase leading-none">
            {formatDateLabel(date)}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
            {withDisparity > 0 && <span className="text-amber-400 ml-2">· {withDisparity} with disparity</span>}
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
          <p className="text-xs font-mono text-foreground">{fmt(totalExVat)} ex-VAT</p>
          <p className="text-xs font-mono text-muted-foreground">{fmt(totalInclVat)} incl.</p>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="p-4 bg-background/40">
          <div className="overflow-x-auto rounded-lg border border-rekker-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rekker-border bg-rekker-surface/80">
                  {HEADERS.map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <InvoiceRow
                    key={inv._id}
                    invoice={inv}
                    onUpdated={handleUpdated}
                    onDeleted={handleDeleted}
                    isAdmin={isAdmin}
                    canEdit={canEdit}
                    i={i}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InvoicePage() {
  const { user } = useAuthStore();
  const isAdmin  = ['super_admin', 'admin'].includes(user?.role);
  const canCreate = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead'].includes(user?.role);

  const [groupedInvoices, setGroupedInvoices] = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [modalOpen, setModalOpen]             = useState(false);
  const [search, setSearch]                   = useState('');
  const [statusFilter, setStatusFilter]       = useState('all');
  const [dateFilter, setDateFilter]           = useState({ start: '', end: '' });
  const [summary, setSummary]                 = useState(null);

  const fetchInvoices = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const params = {};
      if (dateFilter.start) params.startDate = dateFilter.start;
      if (dateFilter.end)   params.endDate   = dateFilter.end;
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/invoices', { params });
      setGroupedInvoices(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [dateFilter, statusFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    if (isAdmin) api.get('/invoices/summary').then((r) => setSummary(r.data)).catch(() => {});
  }, [isAdmin, groupedInvoices.length]);

  const handleCreated = (newInv) => {
    const dateKey = new Date(newInv.date).toISOString().split('T')[0];
    setGroupedInvoices((prev) => {
      const existing = prev.find((g) => g.date === dateKey);
      if (existing) return prev.map((g) => g.date === dateKey ? { ...g, invoices: [newInv, ...g.invoices] } : g);
      return [{ date: dateKey, invoices: [newInv] }, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date));
    });
  };

  const handleUpdated = (updated) => {
    setGroupedInvoices((prev) =>
      prev.map((g) => ({ ...g, invoices: g.invoices.map((inv) => inv._id === updated._id ? updated : inv) }))
    );
  };

  const handleDeleted = (id) => {
    setGroupedInvoices((prev) =>
      prev.map((g) => ({ ...g, invoices: g.invoices.filter((inv) => inv._id !== id) }))
          .filter((g) => g.invoices.length > 0)
    );
  };

  const filtered = groupedInvoices.map((g) => ({
    ...g,
    invoices: g.invoices.filter((inv) =>
      search
        ? inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
          (inv.lpoNumber || '').toLowerCase().includes(search.toLowerCase()) ||
          (inv.branch?.name || inv.branchNameRaw || '').toLowerCase().includes(search.toLowerCase()) ||
          (inv.deliveredBy || '').toLowerCase().includes(search.toLowerCase())
        : true
    ),
  })).filter((g) => g.invoices.length > 0);

  const handleExportCSV = () => {
    const rows = [];
    filtered.forEach((g) =>
      g.invoices.forEach((inv) => rows.push([
        inv.invoiceNumber,
        inv.lpoNumber || inv.lpo?.lpoNumber || '',
        inv.branch?.name || inv.branchNameRaw || '',
        inv.lpo?.amount ?? '',
        inv.amountExVat,
        inv.amountInclVat,
        inv.disparityAmount ?? '',
        inv.lpo?.responsiblePerson?.name || '',
        inv.deliveredBy || '',
        inv.returns || '',
        inv.status,
        g.date,
      ]))
    );
    const headers = ['Invoice No', 'LPO No', 'Branch', 'LPO Amount', 'Ex-VAT', 'Incl. VAT', 'Disparity', 'Prepared By', 'Delivered By', 'Returns', 'Status', 'Date'];
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `invoices-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Invoice Workflow</h1>
          <p className="text-sm text-muted-foreground mt-1">Create, submit and approve invoices linked to LPOs</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchInvoices(true)} disabled={refreshing}>
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-3.5 h-3.5" />CSV
          </Button>
          {canCreate && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />New Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {isAdmin && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Today's Invoices", value: summary.today?.total, icon: Receipt,       color: 'text-primary',     bg: 'bg-primary/10'     },
            { label: 'Today Ex-VAT',     value: summary.today?.totalAmountExVat != null ? `KES ${fmtShort(summary.today.totalAmountExVat)}` : '—', icon: FileCheck, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'With Disparity',   value: summary.today?.withDisparity,    icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-500/10'  },
            { label: 'Approved All Time', value: (summary.byStatus || []).find((s) => s._id === 'approved')?.count ?? 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3">
              <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', bg)}>
                <Icon className={cn('w-4 h-4', color)} />
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-display tracking-wider text-foreground mt-0.5">{value ?? '—'}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl border border-rekker-border bg-rekker-surface">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search invoice, LPO, branch…" className="pl-9 h-8 text-sm"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">From</span>
          <Input type="date" className="h-8 w-36 text-sm" value={dateFilter.start}
            onChange={(e) => setDateFilter((f) => ({ ...f, start: e.target.value }))} />
          <span className="text-xs font-mono text-muted-foreground">To</span>
          <Input type="date" className="h-8 w-36 text-sm" value={dateFilter.end}
            onChange={(e) => setDateFilter((f) => ({ ...f, end: e.target.value }))} />
          {(dateFilter.start || dateFilter.end || statusFilter !== 'all') && (
            <Button variant="ghost" size="sm"
              onClick={() => { setDateFilter({ start: '', end: '' }); setStatusFilter('all'); }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Loading…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-xl">
          <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No invoices found.</p>
          {canCreate && (
            <Button className="mt-4" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />Create First Invoice
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((group, i) => (
            <InvoiceDaySection
              key={group.date}
              date={group.date}
              invoices={group.invoices}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              isAdmin={isAdmin}
              canEdit={canCreate}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      <CreateInvoiceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
