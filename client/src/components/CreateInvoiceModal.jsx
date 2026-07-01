// client/src/components/CreateInvoiceModal.jsx
//
// Two modes:
//   • Single — one LPO → one invoice (with tax treatment).
//   • Batch  — many LPOs in the same branch/date group → many invoices
//              sharing delivered-by, invoice date, VAT rate and tax treatment.
//              User enters an invoice number + amount per LPO.
//
// Tax treatment:
//   • Fully taxable — VAT applied on the whole amount (default).
//   • Fully exempt  — no VAT applied.
//   • Mixed         — user enters the exempt portion; VAT applies to the rest.

import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, Plus, AlertTriangle, CheckCircle2, Search,
  ChevronDown, ChevronRight, Layers, Receipt, Info,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Tax treatment computed values ────────────────────────────────────────────
function computeTax({ amountExVat, taxMode, exemptAmount, vatRate = VAT_RATE }) {
  const sub = Number(amountExVat) || 0;
  let exempt = Number(exemptAmount) || 0;
  if (taxMode === 'taxable') exempt = 0;
  else if (taxMode === 'exempt') exempt = sub;
  else {
    if (exempt < 0) exempt = 0;
    if (exempt > sub) exempt = sub;
  }
  const taxable = sub - exempt;
  const vat     = taxable * (vatRate / 100);
  const incl    = taxable + vat + exempt;
  return { taxable, exempt, vat, incl };
}

// ── Tax treatment picker ─────────────────────────────────────────────────────
function TaxTreatmentPicker({ taxMode, setTaxMode, exemptAmount, setExemptAmount, amountExVat, compact = false }) {
  const tax = computeTax({ amountExVat, taxMode, exemptAmount });
  const OPTS = [
    { val: 'taxable', label: 'Taxable',    sub: `+${VAT_RATE}% VAT`         },
    { val: 'exempt',  label: 'Exempt',     sub: 'No VAT charged'            },
    { val: 'mixed',   label: 'Mixed',      sub: 'Part exempt, part taxable' },
  ];
  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      <Label className="text-xs">Tax Treatment</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {OPTS.map((o) => (
          <button
            key={o.val}
            type="button"
            onClick={() => setTaxMode(o.val)}
            className={cn(
              'px-2 py-1.5 rounded-md border text-left transition-colors',
              taxMode === o.val
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'
            )}
          >
            <p className="text-xs font-semibold leading-tight">{o.label}</p>
            <p className="text-[10px] leading-tight opacity-80 mt-0.5">{o.sub}</p>
          </button>
        ))}
      </div>

      {taxMode === 'mixed' && (
        <div className="space-y-1 pt-1">
          <Label className="text-[11px] text-muted-foreground">Exempt portion (KES)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
            <Input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={exemptAmount}
              onChange={(e) => setExemptAmount(e.target.value)}
              className="pl-10 h-8 text-sm font-mono"
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            Taxable {fmt(tax.taxable)} · VAT {fmt(tax.vat)} · Exempt {fmt(tax.exempt)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── LPO Picker (single mode) ─────────────────────────────────────────────────
function LpoPicker({ lpos, loading, selectedLpo, onSelect }) {
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});

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
      const dateKey = lpo.date ? new Date(lpo.date).toISOString().split('T')[0] : 'Unknown';
      const branchKey = lpo.branch?.name || lpo.branchNameRaw || 'No Branch';
      if (!groups[dateKey]) groups[dateKey] = {};
      if (!groups[dateKey][branchKey]) groups[dateKey][branchKey] = [];
      groups[dateKey][branchKey].push(lpo);
    });
    return groups;
  }, [lpos, search]);

  const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
  const toggle = (d, b) => setExpanded((p) => ({ ...p, [d]: { ...(p[d] || {}), [b]: !(p[d]?.[b]) } }));

  useEffect(() => {
    if (sortedDates.length > 0) {
      const d = sortedDates[0]; const b = Object.keys(grouped[d])[0];
      setExpanded({ [d]: { [b]: true } });
    }
  }, [search, lpos.length]); // eslint-disable-line

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (lpos.length === 0) {
    return <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-lg">All LPOs have been invoiced.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input placeholder="Search LPO number, branch, or person…" className="pl-9 h-8 text-sm"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-accent/10 divide-y divide-border">
        {sortedDates.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">No LPOs match your search.</p>}
        {sortedDates.map((date) => (
          <div key={date}>
            <div className="px-3 py-1.5 bg-rekker-surface/60 sticky top-0">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {format(new Date(date + 'T00:00:00'), 'EEEE dd MMM yyyy')}
              </p>
            </div>
            {Object.entries(grouped[date]).map(([branchName, branchLpos]) => {
              const isOpen = !!(expanded[date]?.[branchName]);
              return (
                <div key={branchName}>
                  <button type="button" onClick={() => toggle(date, branchName)}
                    className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-accent/30 transition-colors text-left">
                    {isOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className="text-xs font-medium text-foreground">{branchName}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] py-0 h-4">{branchLpos.length}</Badge>
                  </button>
                  {isOpen && branchLpos.map((lpo) => {
                    const isSelected = selectedLpo?._id === lpo._id;
                    return (
                      <button key={lpo._id} type="button" onClick={() => onSelect(lpo)}
                        className={cn('w-full flex items-center justify-between px-6 py-2 text-left transition-colors text-sm',
                          isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-accent/40 text-foreground')}>
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-xs tracking-wider">{lpo.lpoNumber}</span>
                          {lpo.responsiblePerson?.name && (
                            <span className="text-muted-foreground text-[11px] ml-2">— {lpo.responsiblePerson.name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {lpo.amount != null && <span className="text-[11px] font-mono text-muted-foreground">KES {fmt(lpo.amount)}</span>}
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
    </div>
  );
}

// ── SINGLE MODE ──────────────────────────────────────────────────────────────
function SingleMode({ lpos, lposLoading, prefillLpo, onCreated, onClose }) {
  const [invoiceNumber, setInvoiceNumber]     = useState('');
  const [selectedLpo, setSelectedLpo]         = useState(null);
  const [amountExVat, setAmountExVat]         = useState('');
  const [disparityReason, setDisparityReason] = useState('');
  const [deliveredBy, setDeliveredBy]         = useState('');
  const [date, setDate]                       = useState(new Date().toISOString().split('T')[0]);
  const [taxMode, setTaxMode]                 = useState('taxable');
  const [exemptAmount, setExemptAmount]       = useState('');
  const [loading, setLoading]                 = useState(false);

  useEffect(() => {
    if (prefillLpo) {
      setSelectedLpo(prefillLpo);
      if (prefillLpo.amount != null) setAmountExVat(String(prefillLpo.amount));
    }
  }, [prefillLpo]);

  const tax = computeTax({ amountExVat, taxMode, exemptAmount });
  const disparity = selectedLpo?.amount != null && amountExVat !== ''
    ? Number(amountExVat) - Number(selectedLpo.amount) : null;
  const hasDisparity = disparity != null && Math.abs(disparity) > 0.01;

  const handleLpoSelect = (lpo) => {
    setSelectedLpo(lpo);
    setDisparityReason('');
    if (lpo?.amount != null) setAmountExVat(String(lpo.amount));
    else setAmountExVat('');
  };

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) return toast.error('Invoice number required');
    if (!selectedLpo)          return toast.error('Select an LPO');
    if (!amountExVat)          return toast.error('Amount required');
    if (hasDisparity && !disparityReason.trim())
      return toast.error('Please enter a reason for the disparity');

    setLoading(true);
    try {
      const res = await api.post('/invoices', {
        invoiceNumber,
        lpoId:          selectedLpo._id,
        amountExVat:    Number(amountExVat),
        amountInclVat:  Number(tax.incl.toFixed(2)),
        vatRate:        VAT_RATE,
        taxMode,
        exemptAmount:   taxMode === 'mixed' ? Number(exemptAmount) || 0 : 0,
        disparityReason: hasDisparity ? disparityReason : '',
        deliveredBy,
        date,
      });
      toast.success(`Invoice ${res.data.invoiceNumber} created!`);
      onCreated(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create invoice');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Invoice Number</Label>
          <Input placeholder="e.g. INV-001" className="font-mono uppercase"
            value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Invoice Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Linked LPO</Label>
        {prefillLpo ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/30 bg-primary/5">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono text-sm text-primary font-semibold">{prefillLpo.lpoNumber}</span>
            <span className="text-xs text-muted-foreground">{prefillLpo.branch?.name || prefillLpo.branchNameRaw || ''}</span>
          </div>
        ) : (
          <LpoPicker lpos={lpos} loading={lposLoading} selectedLpo={selectedLpo} onSelect={handleLpoSelect} />
        )}
      </div>

      {selectedLpo?.amount != null && (
        <p className="text-xs text-muted-foreground font-mono -mt-1">
          LPO Amount: <span className="text-foreground font-medium">KES {fmt(selectedLpo.amount)}</span>
          {selectedLpo.responsiblePerson?.name && (
            <span className="ml-3">Prepared by: <span className="text-foreground">{selectedLpo.responsiblePerson.name}</span></span>
          )}
        </p>
      )}

      <div className="space-y-1.5">
        <Label>Invoice Amount <span className="text-muted-foreground font-normal normal-case">(before VAT)</span></Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
          <Input type="number" min="0" step="0.01" placeholder="0.00"
            value={amountExVat} onChange={(e) => setAmountExVat(e.target.value)}
            className="pl-10 font-mono" />
        </div>
      </div>

      <TaxTreatmentPicker
        taxMode={taxMode} setTaxMode={setTaxMode}
        exemptAmount={exemptAmount} setExemptAmount={setExemptAmount}
        amountExVat={amountExVat}
      />

      {amountExVat !== '' && (
        <div className="rounded-lg border border-border bg-accent/20 px-3 py-2 flex items-center justify-between text-xs font-mono">
          <span className="text-muted-foreground">Total incl. VAT</span>
          <span className="text-foreground font-semibold text-sm">KES {fmt(tax.incl)}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Delivered By <span className="text-muted-foreground font-normal normal-case">(optional)</span></Label>
        <Input placeholder="Name of delivery person…" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)} />
      </div>

      {selectedLpo?.amount != null && amountExVat !== '' && (
        <div className={cn('rounded-lg border px-4 py-3 space-y-2',
          hasDisparity ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5')}>
          <div className="flex items-center gap-2">
            {hasDisparity ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            <p className={cn('text-sm font-medium', hasDisparity ? 'text-amber-300' : 'text-emerald-400')}>
              {hasDisparity
                ? `Disparity: KES ${fmt(Math.abs(disparity))} ${disparity > 0 ? 'over' : 'under'} LPO amount`
                : 'Invoice matches LPO amount ✓'}
            </p>
          </div>
          {hasDisparity && (
            <div className="space-y-1.5">
              <Label className="text-amber-400/80">Reason for Disparity <span className="text-muted-foreground font-normal">(required)</span></Label>
              <Textarea placeholder="e.g. Price adjustment agreed with branch manager…"
                value={disparityReason} onChange={(e) => setDisparityReason(e.target.value)}
                rows={2} className="border-amber-500/30 focus-visible:ring-amber-500/40 text-sm" />
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
  );
}

// ── BATCH MODE ───────────────────────────────────────────────────────────────
function BatchMode({ lpos, lposLoading, onCreated, onClose }) {
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);
  const [selectedLpoIds, setSelectedLpoIds]     = useState([]);
  const [rows, setRows]                         = useState({}); // { lpoId: { invoiceNumber, amountExVat } }
  const [deliveredBy, setDeliveredBy]           = useState('');
  const [date, setDate]                         = useState(new Date().toISOString().split('T')[0]);
  const [taxMode, setTaxMode]                   = useState('taxable');
  const [exemptAmount, setExemptAmount]         = useState('');
  const [loading, setLoading]                   = useState(false);
  const [search, setSearch]                     = useState('');

  // Group uninvoiced LPOs by branch × date
  const groups = useMemo(() => {
    const map = {};
    lpos.forEach((l) => {
      const branchName = l.branch?.name || l.branchNameRaw || 'No Branch';
      const dateKey = l.date ? new Date(l.date).toISOString().split('T')[0] : 'unknown';
      const key = `${dateKey}::${branchName}`;
      if (!map[key]) map[key] = { key, date: dateKey, branchName, branchId: l.branch?._id || null, lpos: [] };
      map[key].lpos.push(l);
    });
    const arr = Object.values(map).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!search.trim()) return arr;
    const q = search.toLowerCase();
    return arr.filter((g) => g.branchName.toLowerCase().includes(q) || g.lpos.some((l) => l.lpoNumber.toLowerCase().includes(q)));
  }, [lpos, search]);

  const selectedGroup = groups.find((g) => g.key === selectedGroupKey);

  const toggleLpo = (lpoId, lpo) => {
    setSelectedLpoIds((prev) => {
      if (prev.includes(lpoId)) return prev.filter((x) => x !== lpoId);
      return [...prev, lpoId];
    });
    setRows((prev) => {
      if (prev[lpoId]) return prev;
      return { ...prev, [lpoId]: { invoiceNumber: '', amountExVat: lpo.amount != null ? String(lpo.amount) : '' } };
    });
  };

  const selectAllInGroup = () => {
    if (!selectedGroup) return;
    const ids = selectedGroup.lpos.map((l) => l._id);
    setSelectedLpoIds(ids);
    setRows((prev) => {
      const next = { ...prev };
      selectedGroup.lpos.forEach((l) => {
        if (!next[l._id]) next[l._id] = { invoiceNumber: '', amountExVat: l.amount != null ? String(l.amount) : '' };
      });
      return next;
    });
  };

  const updateRow = (lpoId, field, val) => {
    setRows((prev) => ({ ...prev, [lpoId]: { ...prev[lpoId], [field]: val } }));
  };

  const totalExVat = selectedLpoIds.reduce((s, id) => s + (Number(rows[id]?.amountExVat) || 0), 0);
  const tax = computeTax({ amountExVat: totalExVat, taxMode, exemptAmount });

  const handleSubmit = async () => {
    if (!selectedLpoIds.length) return toast.error('Select at least one LPO');
    const items = selectedLpoIds.map((id) => {
      const r = rows[id] || {};
      return {
        lpoId: id,
        invoiceNumber: (r.invoiceNumber || '').trim().toUpperCase(),
        amountExVat: Number(r.amountExVat) || 0,
        // Per-invoice tax treatment mirrors the shared setting.
        // For "mixed", we split the shared exempt total pro-rata by amount.
        taxMode,
        exemptAmount: 0,
      };
    });

    if (items.some((i) => !i.invoiceNumber)) return toast.error('Every LPO needs an invoice number');
    if (items.some((i) => !i.amountExVat))    return toast.error('Every LPO needs an amount');

    // Pro-rata split the shared exempt amount (mixed mode only)
    if (taxMode === 'mixed') {
      const total = items.reduce((s, i) => s + i.amountExVat, 0);
      const exemptTotal = Math.min(Number(exemptAmount) || 0, total);
      if (total > 0) {
        items.forEach((i) => { i.exemptAmount = Number((i.amountExVat / total * exemptTotal).toFixed(2)); });
      }
    } else if (taxMode === 'exempt') {
      items.forEach((i) => { i.exemptAmount = i.amountExVat; });
    }

    // Duplicate invoice number check locally
    const nums = items.map((i) => i.invoiceNumber);
    const dupe = nums.find((n, i) => nums.indexOf(n) !== i);
    if (dupe) return toast.error(`Duplicate invoice number: ${dupe}`);

    setLoading(true);
    try {
      const res = await api.post('/invoices/batch', {
        items, deliveredBy, date, vatRate: VAT_RATE,
      });
      toast.success(`${res.data.length} invoice${res.data.length !== 1 ? 's' : ''} created!`);
      res.data.forEach((inv) => onCreated(inv));
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create batch');
    } finally { setLoading(false); }
  };

  if (lposLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (lpos.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg mt-2">All LPOs have been invoiced.</div>;
  }

  return (
    <div className="space-y-4 mt-2">
      {/* Step 1: pick a group */}
      {!selectedGroup && (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200/90 leading-relaxed">
              Pick a branch/date group below. All LPOs you select will be invoiced together —
              you enter the delivery person and tax treatment once, and each LPO gets its own
              invoice number and amount.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search branch or LPO number…" className="pl-9 h-8 text-sm"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-accent/10 divide-y divide-border">
            {groups.map((g) => (
              <button key={g.key} type="button"
                onClick={() => setSelectedGroupKey(g.key)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors text-left">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 border border-primary/20 shrink-0">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{g.branchName}</p>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    {format(new Date(g.date + 'T00:00:00'), 'EEE dd MMM yyyy')}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] py-0 h-5">{g.lpos.length} LPO{g.lpos.length !== 1 ? 's' : ''}</Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
            {groups.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No groups match your search.</p>}
          </div>
        </>
      )}

      {/* Step 2: pick LPOs + fill amounts */}
      {selectedGroup && (
        <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setSelectedGroupKey(null); setSelectedLpoIds([]); setRows({}); }}
              className="text-xs text-muted-foreground hover:text-foreground underline">
              ← Change group
            </button>
            <div className="flex-1" />
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={selectAllInGroup}>
              Select all
            </Button>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-sm font-semibold text-primary">{selectedGroup.branchName}</p>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {format(new Date(selectedGroup.date + 'T00:00:00'), 'EEE dd MMM yyyy')} · {selectedGroup.lpos.length} LPO{selectedGroup.lpos.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Shared fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Delivered By</Label>
              <Input placeholder="Delivery person…" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)} />
            </div>
          </div>

          <TaxTreatmentPicker
            taxMode={taxMode} setTaxMode={setTaxMode}
            exemptAmount={exemptAmount} setExemptAmount={setExemptAmount}
            amountExVat={totalExVat}
          />
          {taxMode === 'mixed' && (
            <p className="text-[10px] text-muted-foreground -mt-1">
              The exempt portion is split pro-rata across selected LPOs by their amount.
            </p>
          )}

          {/* LPO rows */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_1.2fr_1fr] gap-2 px-3 py-2 bg-rekker-surface/60 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <span></span>
              <span>LPO</span>
              <span>Invoice #</span>
              <span className="text-right">Amount (ex-VAT)</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {selectedGroup.lpos.map((lpo) => {
                const checked = selectedLpoIds.includes(lpo._id);
                const row = rows[lpo._id] || { invoiceNumber: '', amountExVat: '' };
                return (
                  <div key={lpo._id} className={cn('grid grid-cols-[auto_1fr_1.2fr_1fr] gap-2 items-center px-3 py-2',
                    checked ? 'bg-primary/5' : '')}>
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleLpo(lpo._id, lpo)}
                      className="w-4 h-4 rounded border-border shrink-0" />
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-foreground tracking-wider">{lpo.lpoNumber}</p>
                      {lpo.amount != null && (
                        <p className="text-[10px] font-mono text-muted-foreground">LPO KES {fmt(lpo.amount)}</p>
                      )}
                    </div>
                    <Input placeholder="INV-…" className="h-7 text-xs font-mono uppercase"
                      disabled={!checked}
                      value={row.invoiceNumber}
                      onChange={(e) => updateRow(lpo._id, 'invoiceNumber', e.target.value)} />
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">KES</span>
                      <Input type="number" min="0" step="0.01" placeholder="0.00"
                        className="pl-9 h-7 text-xs font-mono text-right"
                        disabled={!checked}
                        value={row.amountExVat}
                        onChange={(e) => updateRow(lpo._id, 'amountExVat', e.target.value)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedLpoIds.length > 0 && (
            <div className="rounded-lg border border-border bg-accent/20 px-3 py-2 space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Selected</span>
                <span className="text-foreground">{selectedLpoIds.length} LPO{selectedLpoIds.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal (ex-VAT)</span>
                <span className="text-foreground">KES {fmt(totalExVat)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total incl. VAT</span>
                <span className="text-foreground font-semibold text-sm">KES {fmt(tax.incl)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="button" className="flex-1" disabled={loading || !selectedLpoIds.length} onClick={handleSubmit}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Create {selectedLpoIds.length || ''} Invoice{selectedLpoIds.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function CreateInvoiceModal({ open, onClose, onCreated, prefillLpo = null }) {
  const [lpos, setLpos]               = useState([]);
  const [lposLoading, setLposLoading] = useState(false);
  const [tab, setTab]                 = useState(prefillLpo ? 'single' : 'single');

  useEffect(() => {
    if (open) {
      setTab(prefillLpo ? 'single' : 'single');
      setLposLoading(true);
      api.get('/lpos/uninvoiced')
        .then((r) => setLpos(Array.isArray(r.data) ? r.data : []))
        .finally(() => setLposLoading(false));
    }
  }, [open, prefillLpo]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
          <DialogDescription>
            {prefillLpo
              ? 'Enter the invoice details for the selected LPO.'
              : 'Create a single invoice, or batch-invoice several LPOs from the same branch.'}
          </DialogDescription>
        </DialogHeader>

        {prefillLpo ? (
          <SingleMode lpos={lpos} lposLoading={lposLoading} prefillLpo={prefillLpo}
            onCreated={onCreated} onClose={onClose} />
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="mt-2">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="single">
                <Receipt className="w-3.5 h-3.5 mr-1.5" /> Single Invoice
              </TabsTrigger>
              <TabsTrigger value="batch">
                <Layers className="w-3.5 h-3.5 mr-1.5" /> Batch by Branch
              </TabsTrigger>
            </TabsList>
            <TabsContent value="single">
              <SingleMode lpos={lpos} lposLoading={lposLoading} prefillLpo={null}
                onCreated={onCreated} onClose={onClose} />
            </TabsContent>
            <TabsContent value="batch">
              <BatchMode lpos={lpos} lposLoading={lposLoading}
                onCreated={onCreated} onClose={onClose} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
