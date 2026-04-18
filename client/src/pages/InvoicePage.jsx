// client/src/pages/InvoicePage.jsx

import { useEffect, useState, useCallback } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Plus, RefreshCw, Loader2, Search, FileCheck, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, CalendarDays,
  Receipt, Send, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—';
  return `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isToday(d))     return `Today — ${format(d, 'EEEE dd/MM/yyyy')}`;
  if (isYesterday(d)) return `Yesterday — ${format(d, 'EEEE dd/MM/yyyy')}`;
  return format(d, 'EEEE dd/MM/yyyy');
}

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     variant: 'pending',  icon: Clock        },
  submitted: { label: 'Submitted', variant: 'warning',  icon: Send         },
  approved:  { label: 'Approved',  variant: 'success',  icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  variant: 'destructive', icon: XCircle   },
};

function InvoiceStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reject Dialog
// ─────────────────────────────────────────────────────────────────────────────
function RejectDialog({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reject Invoice</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Reason for rejection</Label>
            <Textarea placeholder="Explain why this invoice is rejected…" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={() => { onConfirm(reason); onClose(); }} disabled={!reason.trim()}>
              Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Row
// ─────────────────────────────────────────────────────────────────────────────
function InvoiceRow({ invoice, onUpdated, isAdmin }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [rejectOpen, setRejectOpen]       = useState(false);

  const doAction = async (action, extra = {}) => {
    setLoadingAction(action);
    try {
      const res = await api.patch(`/invoices/${invoice._id}/status`, { action, ...extra });
      onUpdated(res.data);
      toast.success(`Invoice ${action}ed`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setLoadingAction(null);
    }
  };

  const hasDisparity = invoice.disparityAmount != null && Math.abs(invoice.disparityAmount) > 0.01;

  return (
    <>
      <tr className="border-b border-rekker-border/50 hover:bg-accent/20 transition-colors">
        {/* Invoice Number */}
        <td className="px-4 py-3">
          <span className="font-mono text-xs font-semibold text-primary tracking-wider">
            {invoice.invoiceNumber}
          </span>
        </td>

        {/* Linked LPO */}
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-foreground">{invoice.lpoNumber || invoice.lpo?.lpoNumber || '—'}</span>
        </td>

        {/* Branch */}
        <td className="px-4 py-3 text-xs text-foreground">
          {invoice.branch?.name || invoice.branchNameRaw || '—'}
        </td>

        {/* Amount ex-VAT */}
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-foreground">{fmt(invoice.amountExVat)}</span>
        </td>

        {/* Amount incl-VAT */}
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-foreground">{fmt(invoice.amountInclVat)}</span>
        </td>

        {/* Disparity */}
        <td className="px-4 py-3">
          {hasDisparity ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className={cn('font-mono text-xs font-semibold', invoice.disparityAmount > 0 ? 'text-amber-400' : 'text-destructive')}>
                      {invoice.disparityAmount > 0 ? '+' : ''}{fmt(invoice.disparityAmount)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Disparity reason:</p>
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

        {/* Status */}
        <td className="px-4 py-3"><InvoiceStatusBadge status={invoice.status} /></td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-nowrap">
            {invoice.status === 'draft' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="default" className="h-7 px-2.5"
                      disabled={!!loadingAction}
                      onClick={() => doAction('submit')}>
                      {loadingAction === 'submit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span className="hidden xl:inline ml-1 text-xs">Submit</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Submit for approval</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {invoice.status === 'submitted' && isAdmin && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="success" className="h-7 px-2.5"
                        disabled={!!loadingAction}
                        onClick={() => doAction('approve')}>
                        {loadingAction === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                        <span className="hidden xl:inline ml-1 text-xs">Approve</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Approve invoice</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="destructive" className="h-7 px-2.5"
                        disabled={!!loadingAction}
                        onClick={() => setRejectOpen(true)}>
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline ml-1 text-xs">Reject</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reject invoice</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
            {invoice.status === 'rejected' && invoice.rejectionReason && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <XCircle className="w-4 h-4 text-destructive cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-semibold mb-1">Rejection reason:</p>
                    <p>{invoice.rejectionReason}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </td>
      </tr>

      <RejectDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => doAction('reject', { rejectionReason: reason })}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Day Section
// ─────────────────────────────────────────────────────────────────────────────
function InvoiceDaySection({ date, invoices: initialInvoices, onUpdated, isAdmin, defaultOpen }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => { setInvoices(initialInvoices); }, [initialInvoices]);

  const handleUpdated = (updated) => {
    setInvoices((prev) => prev.map((inv) => (inv._id === updated._id ? updated : inv)));
    onUpdated(updated);
  };

  const totalExVat    = invoices.reduce((s, i) => s + (i.amountExVat || 0), 0);
  const totalInclVat  = invoices.reduce((s, i) => s + (i.amountInclVat || 0), 0);
  const withDisparity = invoices.filter((i) => i.disparityAmount != null && Math.abs(i.disparityAmount) > 0.01).length;

  return (
    <div className="rounded-xl border border-rekker-border overflow-hidden animate-fade-up">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 bg-rekker-surface hover:bg-accent/20 transition-colors text-left">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
          <CalendarDays className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-xl tracking-widest text-foreground uppercase leading-none">{formatDateLabel(date)}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
            {withDisparity > 0 && <span className="text-amber-400 ml-2">· {withDisparity} with disparity</span>}
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0">
          <p className="text-xs font-mono text-foreground">{fmt(totalExVat)} ex-VAT</p>
          <p className="text-xs font-mono text-muted-foreground">{fmt(totalInclVat)} incl.</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="p-4 bg-background/40">
          <div className="overflow-x-auto rounded-lg border border-rekker-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rekker-border bg-rekker-surface/80">
                  {['Invoice No.', 'LPO No.', 'Branch', 'Ex-VAT', 'Incl. VAT', 'Disparity', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <InvoiceRow key={inv._id} invoice={inv} onUpdated={handleUpdated} isAdmin={isAdmin} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function InvoicePage() {
  const { user } = useAuthStore();
  const isAdmin  = ['super_admin', 'admin'].includes(user?.role);
  const canCreate = ['super_admin', 'admin', 'team_lead'].includes(user?.role);

  const [groupedInvoices, setGroupedInvoices] = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [modalOpen, setModalOpen]             = useState(false);
  const [search, setSearch]                   = useState('');
  const [statusFilter, setStatusFilter]       = useState('all');
  const [dateFilter, setDateFilter]           = useState({ start: '', end: '' });

  // Summary stats
  const [summary, setSummary] = useState(null);

  const fetchInvoices = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const params = {};
      if (dateFilter.start) params.startDate = dateFilter.start;
      if (dateFilter.end)   params.endDate   = dateFilter.end;
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/invoices', { params });
      setGroupedInvoices(res.data);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [dateFilter, statusFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    if (isAdmin) {
      api.get('/invoices/summary').then((r) => setSummary(r.data)).catch(() => {});
    }
  }, [isAdmin, groupedInvoices]);

  const handleCreated = (newInvoice) => {
    const dateKey = new Date(newInvoice.date).toISOString().split('T')[0];
    setGroupedInvoices((prev) => {
      const existing = prev.find((g) => g.date === dateKey);
      if (existing) {
        return prev.map((g) => g.date === dateKey ? { ...g, invoices: [newInvoice, ...g.invoices] } : g);
      }
      return [{ date: dateKey, invoices: [newInvoice] }, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date));
    });
  };

  const handleUpdated = (updated) => {
    setGroupedInvoices((prev) =>
      prev.map((g) => ({
        ...g,
        invoices: g.invoices.map((inv) => (inv._id === updated._id ? updated : inv)),
      }))
    );
  };

  const filtered = groupedInvoices.map((g) => ({
    ...g,
    invoices: g.invoices.filter((inv) =>
      search
        ? inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
          (inv.lpoNumber || '').toLowerCase().includes(search.toLowerCase()) ||
          (inv.branch?.name || inv.branchNameRaw || '').toLowerCase().includes(search.toLowerCase())
        : true
    ),
  })).filter((g) => g.invoices.length > 0);

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
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canCreate && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              New Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards (admin only) */}
      {isAdmin && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Today's Invoices", value: summary.today.total, sub: 'created today', icon: Receipt, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Today Ex-VAT', value: `KES ${Number(summary.today.totalAmountExVat).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`, sub: 'total value', icon: FileCheck, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'With Disparity', value: summary.today.withDisparity, sub: 'today', icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
            ...summary.byStatus.map((s) => ({
              label: STATUS_CONFIG[s._id]?.label || s._id,
              value: s.count,
              sub: 'all time',
              icon: STATUS_CONFIG[s._id]?.icon || Clock,
              color: s._id === 'approved' ? 'text-emerald-400' : s._id === 'rejected' ? 'text-destructive' : 'text-muted-foreground',
              bg: s._id === 'approved' ? 'bg-emerald-500/10' : s._id === 'rejected' ? 'bg-destructive/10' : 'bg-muted/20',
            })).slice(0, 1),
          ].map(({ label, value, sub, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border border-rekker-border bg-rekker-surface p-4 flex items-start gap-3 hover:border-primary/30 transition-colors">
              <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', bg)}>
                <Icon className={cn('w-4 h-4', color)} />
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-display tracking-wider text-foreground mt-0.5">{value ?? '—'}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl border border-rekker-border bg-rekker-surface">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search invoice or LPO number…" className="pl-9 h-8 text-sm"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
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
            <Button variant="ghost" size="sm" onClick={() => { setDateFilter({ start: '', end: '' }); setStatusFilter('all'); }}>
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
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Loading invoices…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-xl">
          <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No invoices found.</p>
          {canCreate && (
            <Button className="mt-4" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create First Invoice
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
              isAdmin={isAdmin}
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
