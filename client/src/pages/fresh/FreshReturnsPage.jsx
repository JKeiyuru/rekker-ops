// client/src/pages/fresh/FreshReturnsPage.jsx
// Value-mode and items-mode returns. Custom reasons. Cancel LPO selection.
// Day grouping + date filters.

import { useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Trash2, X, Loader2, Search, ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

const BUILT_IN_REASONS = [
  { v: 'damaged', l: 'Damaged' },
  { v: 'wrong_item', l: 'Wrong item' },
  { v: 'wrong_quantity', l: 'Wrong quantity' },
  { v: 'expired', l: 'Expired' },
  { v: 'short_dated', l: 'Short-dated' },
  { v: 'refused', l: 'Refused' },
  { v: 'excess', l: 'Excess' },
  { v: 'quality_issue', l: 'Quality issue' },
  { v: 'other', l: 'Other' },
];

function ReturnModal({ open, onClose, onSaved }) {
  const [tab, setTab] = useState('value'); // 'value' | 'items'
  const [lpoCandidates, setLpoCandidates] = useState([]);
  const [customReasons, setCustomReasons] = useState([]);

  // Reason
  const [reasonValue, setReasonValue] = useState('damaged'); // a built-in code OR custom-{label} OR 'NEW'
  const [newReason, setNewReason] = useState('');
  const [saveCustom, setSaveCustom] = useState(true);
  const [notes, setNotes] = useState('');

  // Items mode
  const [selectedLpoIds, setSelectedLpoIds] = useState([]);
  const [lpoDocs, setLpoDocs] = useState({});
  const [picked, setPicked] = useState({}); // itemId -> qty

  // Value mode
  const [valueLines, setValueLines] = useState([]); // [{ lpoId, amount, notes }]
  const [lpoSearch, setLpoSearch] = useState('');

  const reset = () => {
    setTab('value'); setReasonValue('damaged'); setNewReason(''); setSaveCustom(true); setNotes('');
    setSelectedLpoIds([]); setLpoDocs({}); setPicked({});
    setValueLines([]); setLpoSearch('');
  };

  useEffect(() => {
    if (!open) return;
    reset();
    Promise.all([
      api.get('/fresh-customer-lpos'),
      api.get('/return-reasons').catch(() => ({ data: [] })),
    ]).then(([a, b]) => {
      setLpoCandidates(a.data || []);
      setCustomReasons(b.data || []);
    });
  }, [open]);

  const filteredCandidates = useMemo(() => {
    const q = lpoSearch.trim().toLowerCase();
    return lpoCandidates.filter(l => {
      if (!q) return true;
      const txt = `${l.lpoNumber} ${l.customer?.name || l.customerNameRaw || ''}`.toLowerCase();
      return txt.includes(q);
    });
  }, [lpoCandidates, lpoSearch]);

  // ─── ITEMS MODE ─────────────────────────────────────────────────────────────
  const toggleLpo = async (id) => {
    const lpo = lpoCandidates.find(l => l._id === id);
    if (lpo?.hasValueReturns) {
      toast.error(`${lpo.lpoNumber} has value-only returns — use the Value tab for it.`);
      return;
    }
    if (!lpo?.items?.length) {
      toast.error(`${lpo?.lpoNumber} has no items — use the Value tab.`);
      return;
    }
    if (selectedLpoIds.includes(id)) {
      setSelectedLpoIds((p) => p.filter((x) => x !== id));
      const items = lpoDocs[id]?.items || [];
      setPicked((p) => { const c = { ...p }; items.forEach((it) => delete c[it._id]); return c; });
    } else {
      const res = await api.get(`/fresh-customer-lpos/${id}`);
      setLpoDocs((p) => ({ ...p, [id]: res.data }));
      setSelectedLpoIds((p) => [...p, id]);
    }
  };
  const cancelItemLpo = (id) => toggleLpo(id);

  // ─── VALUE MODE ─────────────────────────────────────────────────────────────
  const addValueLine = (lpo) => {
    if (lpo.hasItemReturns) {
      toast.error(`${lpo.lpoNumber} already has item-level returns — use the Items tab.`);
      return;
    }
    if (valueLines.find(v => v.lpoId === lpo._id)) return;
    setValueLines(p => [...p, { lpoId: lpo._id, lpoNumber: lpo.lpoNumber, customer: lpo.customer?.name || lpo.customerNameRaw, remaining: Number(lpo.totalValue || 0) - Number(lpo.valueReturnedTotal || 0), amount: '', notes: '' }]);
  };
  const removeValueLine = (lpoId) => setValueLines(p => p.filter(v => v.lpoId !== lpoId));
  const updateValueLine = (lpoId, patch) => setValueLines(p => p.map(v => v.lpoId === lpoId ? { ...v, ...patch } : v));

  // ─── SAVE ────────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const save = async () => {
    let reason = reasonValue;
    let saveCustomFlag = false;
    if (reasonValue === 'NEW') {
      if (!newReason.trim()) return toast.error('Type the new reason');
      reason = newReason.trim();
      saveCustomFlag = saveCustom;
    } else if (reasonValue.startsWith('custom-')) {
      reason = reasonValue.slice('custom-'.length);
    }
    setLoading(true);
    try {
      if (tab === 'items') {
        const items = [];
        for (const lpoId of selectedLpoIds) {
          const doc = lpoDocs[lpoId];
          for (const it of (doc?.items || [])) {
            const qty = Number(picked[it._id] || 0);
            if (qty > 0) items.push({ lpo: lpoId, itemId: it._id, qty });
          }
        }
        if (!items.length) return toast.error('Pick at least one item to return');
        const res = await api.post('/fresh-returns', { mode: 'items', reason, saveCustom: saveCustomFlag, notes, items });
        onSaved(res.data);
      } else {
        const lines = valueLines.filter(v => Number(v.amount) > 0).map(v => ({ lpo: v.lpoId, amount: Number(v.amount), notes: v.notes }));
        if (!lines.length) return toast.error('Add at least one value return line');
        const res = await api.post('/fresh-returns', { mode: 'value', reason, saveCustom: saveCustomFlag, notes, valueLines: lines });
        onSaved(res.data);
      }
      toast.success('Return logged');
      onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Return</DialogTitle>
          <DialogDescription>Enter just the value (fastest) or list the exact items returned.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Reason picker */}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reasonValue} onValueChange={setReasonValue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUILT_IN_REASONS.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}
                {customReasons.length > 0 && <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Saved</div>}
                {customReasons.map(r => <SelectItem key={r._id} value={`custom-${r.label}`}>{r.label}</SelectItem>)}
                <SelectItem value="NEW">+ Add new reason…</SelectItem>
              </SelectContent>
            </Select>
            {reasonValue === 'NEW' && (
              <div className="space-y-2 pt-2">
                <Input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="e.g. Packaging defect" />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={saveCustom} onCheckedChange={setSaveCustom} />
                  Save this reason for future returns
                </label>
              </div>
            )}
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="value">Value only (fast)</TabsTrigger>
              <TabsTrigger value="items">By items</TabsTrigger>
            </TabsList>

            {/* ─── VALUE MODE ───────────────────────────────────────────── */}
            <TabsContent value="value" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label>Pick LPO(s)</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input className="pl-7 h-9" placeholder="Search LPO # or customer…" value={lpoSearch} onChange={(e) => setLpoSearch(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2 p-2 rounded-lg border border-border bg-accent/20 max-h-40 overflow-auto">
                  {filteredCandidates.length === 0 && <p className="text-xs text-muted-foreground p-2">No LPOs match.</p>}
                  {filteredCandidates.map((l) => {
                    const added = valueLines.find(v => v.lpoId === l._id);
                    const blocked = l.hasItemReturns;
                    return (
                      <button key={l._id} type="button" onClick={() => addValueLine(l)} disabled={!!added || blocked}
                        className={cn('px-3 py-1.5 rounded-full text-xs font-mono border transition',
                          added ? 'bg-primary/15 border-primary/40 text-primary cursor-default' :
                          blocked ? 'opacity-40 cursor-not-allowed border-border' :
                          'bg-background border-border text-muted-foreground hover:text-foreground')}>
                        {l.lpoNumber} · {l.customer?.name || l.customerNameRaw || '—'}
                        {blocked && <span className="ml-1 text-[9px] uppercase">items-mode</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {valueLines.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-xl">
                  <p className="text-xs text-muted-foreground">Pick one or more LPOs above, then enter the returned amount.</p>
                </div>
              ) : valueLines.map((v) => (
                <div key={v.lpoId} className="rounded-xl border border-rekker-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-mono text-primary">{v.lpoNumber}</span>
                      <span className="text-muted-foreground"> · {v.customer || '—'}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => removeValueLine(v.lpoId)}>
                      <X className="w-3.5 h-3.5" /> Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5 space-y-1">
                      <Label className="text-[10px] uppercase tracking-widest">Amount (KES)</Label>
                      <Input type="number" min="0" max={v.remaining} step="any" value={v.amount}
                        onChange={(e) => updateValueLine(v.lpoId, { amount: e.target.value })} className="font-mono" />
                    </div>
                    <div className="col-span-3 text-xs text-muted-foreground font-mono pb-2">
                      Max: {v.remaining.toLocaleString()}
                    </div>
                    <div className="col-span-4 space-y-1">
                      <Label className="text-[10px] uppercase tracking-widest">Line notes</Label>
                      <Input value={v.notes} onChange={(e) => updateValueLine(v.lpoId, { notes: e.target.value })} placeholder="Optional" />
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* ─── ITEMS MODE ───────────────────────────────────────────── */}
            <TabsContent value="items" className="space-y-3 mt-4">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 flex items-start gap-2 text-xs text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Use this mode only if the LPO was created with itemised contents. For Quick LPOs (number + amount only), use the Value tab.</span>
              </div>
              <div className="space-y-1.5">
                <Label>LPOs ({selectedLpoIds.length} selected)</Label>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-accent/20 max-h-40 overflow-auto">
                  {lpoCandidates.filter(l => (l.items || []).some((it) => Number(it.quantity || 0) - Number(it.returnedQty || 0) > 0))
                    .map((l) => {
                      const sel = selectedLpoIds.includes(l._id);
                      const blocked = l.hasValueReturns;
                      return (
                        <button key={l._id} type="button" onClick={() => toggleLpo(l._id)} disabled={blocked && !sel}
                          className={cn('px-3 py-1.5 rounded-full text-xs font-mono border',
                            sel ? 'bg-primary/15 border-primary/40 text-primary' :
                            blocked ? 'opacity-40 cursor-not-allowed border-border' :
                            'bg-background border-border text-muted-foreground hover:text-foreground')}>
                          {l.lpoNumber} · {l.customer?.name || l.customerNameRaw || '—'}
                          {blocked && <span className="ml-1 text-[9px] uppercase">value-mode</span>}
                        </button>
                      );
                    })}
                </div>
              </div>

              {selectedLpoIds.map((id) => {
                const doc = lpoDocs[id];
                if (!doc) return null;
                return (
                  <div key={id} className="rounded-xl border border-rekker-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-mono text-primary">{doc.lpoNumber}</p>
                      <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => cancelItemLpo(id)}>
                        <X className="w-3.5 h-3.5" /> Cancel this LPO
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {doc.items.map((it) => {
                        const remaining = Number(it.quantity || 0) - Number(it.returnedQty || 0);
                        return (
                          <div key={it._id} className="grid grid-cols-12 gap-2 items-center text-xs">
                            <div className="col-span-5">{it.name} <span className="text-muted-foreground">({it.unit})</span></div>
                            <div className="col-span-3 text-muted-foreground font-mono">Remaining: {remaining}</div>
                            <div className="col-span-2 text-muted-foreground font-mono">@ {Number(it.unitPrice).toLocaleString()}</div>
                            <div className="col-span-2">
                              <Input type="number" min="0" max={remaining} step="any"
                                value={picked[it._id] || ''}
                                onChange={(e) => setPicked((p) => ({ ...p, [it._id]: e.target.value }))}
                                placeholder="Qty back" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>

          <div className="space-y-1.5">
            <Label>Notes (overall)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional…" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={save} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Log Return
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function dayKey(d) {
  const dt = new Date(d);
  if (isToday(dt))     return 'Today';
  if (isYesterday(dt)) return 'Yesterday';
  return format(dt, 'EEEE, dd MMM yyyy');
}

export default function FreshReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState({ startDate: '', endDate: '', mode: '' });
  const [collapsed, setCollapsed] = useState({});

  const load = () => {
    setLoading(true);
    const params = {};
    if (filter.startDate) params.startDate = filter.startDate;
    if (filter.endDate)   params.endDate   = filter.endDate;
    if (filter.mode)      params.mode      = filter.mode;
    api.get('/fresh-returns', { params })
      .then((r) => setReturns(r.data || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter.startDate, filter.endDate, filter.mode]);

  const handleSaved = () => load();
  const remove = async (r) => {
    if (!window.confirm(`Delete return ${r.returnNumber}? Original quantities/amounts will be restored.`)) return;
    try { await api.delete(`/fresh-returns/${r._id}`); toast.success('Return deleted'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of returns) {
      const k = dayKey(r.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return Array.from(map.entries());
  }, [returns]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><RotateCcw className="w-6 h-6 text-primary" /> Returns</h1>
          <p className="text-sm text-muted-foreground mt-1">Log returns by value (fast) or by exact items.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Log Return</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl border border-rekker-border bg-rekker-surface/40">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest">From</Label>
          <Input type="date" className="h-8" value={filter.startDate} onChange={(e) => setFilter(p => ({ ...p, startDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest">To</Label>
          <Input type="date" className="h-8" value={filter.endDate} onChange={(e) => setFilter(p => ({ ...p, endDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest">Mode</Label>
          <Select value={filter.mode || '__all'} onValueChange={(v) => setFilter(p => ({ ...p, mode: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All</SelectItem>
              <SelectItem value="value">Value</SelectItem>
              <SelectItem value="items">Items</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-rekker-surface animate-pulse" />)}</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <p className="text-sm text-muted-foreground">No returns yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, list]) => {
            const isC = collapsed[day];
            const dayTotal = list.reduce((a, r) => a + Number(r.totalValue || 0), 0);
            return (
              <div key={day} className="rounded-xl border border-rekker-border overflow-hidden">
                <button onClick={() => setCollapsed(p => ({ ...p, [day]: !p[day] }))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-rekker-surface hover:bg-accent/30 transition">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={cn('w-4 h-4 transition-transform', isC && '-rotate-90')} />
                    <span className="text-sm font-medium">{day}</span>
                    <Badge variant="outline" className="text-[10px]">{list.length}</Badge>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">
                    Total returned <span className="text-primary">KES {dayTotal.toLocaleString()}</span>
                  </div>
                </button>
                {!isC && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-rekker-surface/60">
                        <tr>{['Return #','Mode','Reason','LPOs','Value',''].map((h) => (
                          <th key={h} className="text-left px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r._id} className="border-t border-rekker-border/40 hover:bg-accent/20">
                            <td className="px-4 py-2 font-mono text-primary">{r.returnNumber}</td>
                            <td className="px-4 py-2"><Badge variant="secondary">{r.mode}</Badge></td>
                            <td className="px-4 py-2"><Badge variant="outline">{r.reasonLabel || r.reason}</Badge></td>
                            <td className="px-4 py-2 text-xs font-mono">{(r.lpos || []).map((l) => l.lpoNumber).join(', ')}</td>
                            <td className="px-4 py-2 font-mono">KES {Number(r.totalValue||0).toLocaleString()}</td>
                            <td className="px-4 py-2">
                              <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => remove(r)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ReturnModal open={open} onClose={() => setOpen(false)} onSaved={handleSaved} />
    </div>
  );
}
