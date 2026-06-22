// client/src/pages/fresh/FreshCustomerLPOsPage.jsx
// Quick (number + branch + amount, batch-supported) and Detailed (with items) tabs.
// Day grouping + date filters. Inline edit for typo recovery.

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, ShoppingCart, Layers, Loader2, Copy, Edit2, Trash2, Search, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_VARIANT = {
  pending: 'secondary', delivered: 'default', partially_returned: 'warning',
  fully_returned: 'destructive', closed: 'outline', cancelled: 'outline',
};

const blankQuick = () => ({ lpoNumber: '', customer: '', customerNameRaw: '', amount: '', deliveryDate: '', notes: '' });
const blankItem  = () => ({ name: '', sku: '', unit: 'pcs', quantity: 1, unitPrice: 0 });
const blankDetailed = () => ({
  lpoNumber: '', customer: '', customerNameRaw: '', deliveryLocation: '',
  deliveryDate: '', notes: '', items: [blankItem()],
});

// ─── Create/Edit modal ────────────────────────────────────────────────────────
function LpoModal({ open, onClose, onSaved, branches, editing }) {
  const [tab, setTab] = useState('quick');
  const [quickRows, setQuickRows] = useState([blankQuick()]);
  const [detailed, setDetailed]   = useState([blankDetailed()]);
  const [loading, setLoading] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const hasItems = (editing.items || []).length > 0;
      setTab(hasItems ? 'detailed' : 'quick');
      if (hasItems) {
        setDetailed([{
          lpoNumber: editing.lpoNumber,
          customer: editing.customer?._id || '',
          customerNameRaw: editing.customerNameRaw || '',
          deliveryLocation: editing.deliveryLocation || '',
          deliveryDate: editing.deliveryDate ? editing.deliveryDate.slice(0, 10) : '',
          notes: editing.notes || '',
          items: editing.items.map(it => ({ ...it })),
        }]);
        setQuickRows([blankQuick()]);
      } else {
        setQuickRows([{
          lpoNumber: editing.lpoNumber,
          customer: editing.customer?._id || '',
          customerNameRaw: editing.customerNameRaw || '',
          amount: editing.totalValue || editing.quickAmount || '',
          deliveryDate: editing.deliveryDate ? editing.deliveryDate.slice(0, 10) : '',
          notes: editing.notes || '',
        }]);
        setDetailed([blankDetailed()]);
      }
    } else {
      setQuickRows([blankQuick()]);
      setDetailed([blankDetailed()]);
      setTab('quick');
    }
  }, [open, editing]);

  // ─── Quick handlers ─────────────────────────────────────────────────────────
  const upQ = (i, patch) => setQuickRows(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addQ = () => setQuickRows(p => [...p, blankQuick()]);
  const dupQ = (i) => setQuickRows(p => { const c = { ...p[i], lpoNumber: '' }; return [...p, c]; });
  const rmQ  = (i) => setQuickRows(p => p.filter((_, idx) => idx !== i));

  // ─── Detailed handlers ──────────────────────────────────────────────────────
  const upD  = (i, patch) => setDetailed(p => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const upDI = (li, ii, patch) => setDetailed(p => p.map((l, idx) => {
    if (idx !== li) return l;
    return { ...l, items: l.items.map((it, j) => j === ii ? { ...it, ...patch } : it) };
  }));
  const addItem = (li) => upD(li, { items: [...detailed[li].items, blankItem()] });
  const rmItem  = (li, ii) => upD(li, { items: detailed[li].items.filter((_, j) => j !== ii) });
  const totalOf = (l) => (l.items || []).reduce((a, it) => a + Number(it.quantity || 0) * Number(it.unitPrice || 0), 0);

  // ─── Save ───────────────────────────────────────────────────────────────────
  const save = async () => {
    setLoading(true);
    try {
      if (isEdit) {
        const src = tab === 'quick' ? quickRows[0] : detailed[0];
        const payload = tab === 'quick'
          ? { lpoNumber: src.lpoNumber, customer: src.customer || null, customerNameRaw: src.customerNameRaw,
              quickAmount: Number(src.amount), items: [], deliveryDate: src.deliveryDate || null, notes: src.notes }
          : { lpoNumber: src.lpoNumber, customer: src.customer || null, customerNameRaw: src.customerNameRaw,
              deliveryLocation: src.deliveryLocation, deliveryDate: src.deliveryDate || null, notes: src.notes,
              items: src.items.map(it => ({ ...it, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) })) };
        const res = await api.put(`/fresh-customer-lpos/${editing._id}`, payload);
        toast.success('LPO updated');
        onSaved([res.data]);
        onClose();
        return;
      }

      if (tab === 'quick') {
        for (const [i, r] of quickRows.entries()) {
          if (!r.lpoNumber.trim()) { toast.error(`Row ${i+1}: LPO # required`); setLoading(false); return; }
          if (!(Number(r.amount) > 0)) { toast.error(`Row ${i+1}: amount > 0 required`); setLoading(false); return; }
        }
        const payload = quickRows.map(r => ({
          lpoNumber: r.lpoNumber, customer: r.customer || null, customerNameRaw: r.customerNameRaw,
          quickAmount: Number(r.amount), items: [], deliveryDate: r.deliveryDate || null, notes: r.notes,
        }));
        if (payload.length === 1) {
          const res = await api.post('/fresh-customer-lpos', payload[0]);
          onSaved([res.data]);
        } else {
          const res = await api.post('/fresh-customer-lpos/batch', { lpos: payload });
          onSaved(res.data.lpos || []);
        }
        toast.success(payload.length > 1 ? `Batch of ${payload.length} created` : 'LPO created');
      } else {
        for (const [i, l] of detailed.entries()) {
          if (!l.lpoNumber.trim()) { toast.error(`LPO #${i+1}: number required`); setLoading(false); return; }
          if (!l.items.length)     { toast.error(`LPO #${i+1}: add at least one item`); setLoading(false); return; }
        }
        const payload = detailed.map(l => ({
          ...l, customer: l.customer || null,
          items: l.items.map(it => ({ ...it, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) })),
        }));
        if (payload.length === 1) {
          const res = await api.post('/fresh-customer-lpos', payload[0]);
          onSaved([res.data]);
        } else {
          const res = await api.post('/fresh-customer-lpos/batch', { lpos: payload });
          onSaved(res.data.lpos || []);
        }
        toast.success(payload.length > 1 ? `Batch of ${payload.length} created` : 'LPO created');
      }
      onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const quickTotal = quickRows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const detailedTotal = detailed.reduce((a, l) => a + totalOf(l), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit LPO ${editing?.lpoNumber}` : 'New Customer LPO'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Fix typos — LPO number, branch, amount and items can all be edited.' : 'Quick = LPO # + branch + amount. Detailed = with item lines.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList>
            <TabsTrigger value="quick">Quick {isEdit ? '' : '(LPO # + amount)'}</TabsTrigger>
            <TabsTrigger value="detailed">Detailed {isEdit ? '' : '(with items)'}</TabsTrigger>
          </TabsList>

          {/* ─── QUICK ──────────────────────────────────────────────────── */}
          <TabsContent value="quick" className="space-y-4 mt-4">
            {quickRows.map((r, i) => (
              <div key={i} className="rounded-xl border border-rekker-border p-4 bg-rekker-surface/40 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    LPO {quickRows.length > 1 ? `#${i+1}` : ''}
                  </p>
                  {!isEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => dupQ(i)}><Copy className="w-3.5 h-3.5" /></Button>
                      {quickRows.length > 1 && (
                        <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => rmQ(i)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label>LPO #</Label>
                    <Input value={r.lpoNumber} onChange={(e) => upQ(i, { lpoNumber: e.target.value.toUpperCase() })} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Branch / Customer</Label>
                    <Select value={r.customer || '__none'} onValueChange={(v) => upQ(i, { customer: v === '__none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— free text below —</SelectItem>
                        {branches.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Or customer name</Label>
                    <Input value={r.customerNameRaw} onChange={(e) => upQ(i, { customerNameRaw: e.target.value })} placeholder="Walk-in / shop name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount (KES)</Label>
                    <Input type="number" min="0" step="any" value={r.amount} onChange={(e) => upQ(i, { amount: e.target.value })} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Delivery date</Label>
                    <Input type="date" value={r.deliveryDate} onChange={(e) => upQ(i, { deliveryDate: e.target.value })} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label>Notes</Label>
                    <Input value={r.notes} onChange={(e) => upQ(i, { notes: e.target.value })} placeholder="Optional…" />
                  </div>
                </div>
              </div>
            ))}
            {!isEdit && (
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={addQ}><Layers className="w-4 h-4" /> Add another LPO</Button>
                <p className="text-sm font-mono">
                  <span className="text-muted-foreground">{quickRows.length} LPO{quickRows.length>1?'s':''} · Total</span>
                  <span className="text-primary font-bold ml-2">KES {quickTotal.toLocaleString()}</span>
                </p>
              </div>
            )}
          </TabsContent>

          {/* ─── DETAILED ──────────────────────────────────────────────── */}
          <TabsContent value="detailed" className="space-y-5 mt-4">
            {detailed.map((l, li) => (
              <div key={li} className="rounded-xl border border-rekker-border p-4 space-y-4 bg-rekker-surface/40">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    LPO {detailed.length > 1 ? `#${li+1}` : ''}
                  </p>
                  {!isEdit && detailed.length > 1 && (
                    <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => setDetailed(p => p.filter((_, idx) => idx !== li))}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label>LPO #</Label>
                    <Input value={l.lpoNumber} onChange={(e) => upD(li, { lpoNumber: e.target.value.toUpperCase() })} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Branch / Customer</Label>
                    <Select value={l.customer || '__none'} onValueChange={(v) => upD(li, { customer: v === '__none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— free text below —</SelectItem>
                        {branches.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Or customer name</Label>
                    <Input value={l.customerNameRaw} onChange={(e) => upD(li, { customerNameRaw: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Delivery date</Label>
                    <Input type="date" value={l.deliveryDate} onChange={(e) => upD(li, { deliveryDate: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Items</Label>
                    <Button size="sm" variant="outline" onClick={() => addItem(li)}><Plus className="w-3.5 h-3.5" /> Add item</Button>
                  </div>
                  {l.items.map((it, ii) => (
                    <div key={ii} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4"><Input placeholder="Item name" value={it.name} onChange={(e) => upDI(li, ii, { name: e.target.value })} /></div>
                      <div className="col-span-2"><Input placeholder="SKU" value={it.sku} onChange={(e) => upDI(li, ii, { sku: e.target.value })} className="font-mono" /></div>
                      <div className="col-span-1"><Input placeholder="Unit" value={it.unit} onChange={(e) => upDI(li, ii, { unit: e.target.value })} /></div>
                      <div className="col-span-2"><Input type="number" min="0" step="any" placeholder="Qty" value={it.quantity} onChange={(e) => upDI(li, ii, { quantity: e.target.value })} /></div>
                      <div className="col-span-2"><Input type="number" min="0" step="any" placeholder="Unit price" value={it.unitPrice} onChange={(e) => upDI(li, ii, { unitPrice: e.target.value })} /></div>
                      <div className="col-span-1 flex justify-end">
                        {l.items.length > 1 && (
                          <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => rmItem(li, ii)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-rekker-border/50">
                  <Textarea rows={1} placeholder="Notes…" value={l.notes} onChange={(e) => upD(li, { notes: e.target.value })} className="max-w-md" />
                  <p className="text-sm font-mono"><span className="text-muted-foreground">Total</span> <span className="text-primary font-bold ml-2">KES {totalOf(l).toLocaleString()}</span></p>
                </div>
              </div>
            ))}
            {!isEdit && (
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setDetailed(p => [...p, blankDetailed()])}>
                  <Layers className="w-4 h-4" /> Add another LPO
                </Button>
                <p className="text-sm font-mono">
                  <span className="text-muted-foreground">{detailed.length} LPO{detailed.length>1?'s':''} · Grand total</span>
                  <span className="text-primary font-bold ml-2">KES {detailedTotal.toLocaleString()}</span>
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? 'Save changes' : tab === 'quick'
              ? (quickRows.length > 1 ? `Create batch (${quickRows.length})` : 'Create LPO')
              : (detailed.length > 1 ? `Create batch (${detailed.length})` : 'Create LPO')}
          </Button>
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

export default function FreshCustomerLPOsPage() {
  const [lpos, setLpos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState({
    status: '', search: '',
    startDate: '', endDate: '',
    deliveryStart: '', deliveryEnd: '',
  });
  const [collapsed, setCollapsed] = useState({});

  const load = async () => {
    setLoading(true);
    const params = {};
    if (filter.status) params.status = filter.status;
    if (filter.search) params.search = filter.search;
    if (filter.startDate) params.startDate = filter.startDate;
    if (filter.endDate)   params.endDate   = filter.endDate;
    if (filter.deliveryStart) params.deliveryStartDate = filter.deliveryStart;
    if (filter.deliveryEnd)   params.deliveryEndDate   = filter.deliveryEnd;
    const [a, br] = await Promise.all([
      api.get('/fresh-customer-lpos', { params }),
      api.get('/branches'),
    ]);
    setLpos(a.data || []); setBranches(br.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [
    filter.status, filter.search, filter.startDate, filter.endDate, filter.deliveryStart, filter.deliveryEnd,
  ]);

  const handleSaved = () => { setEditing(null); load(); };
  const onDelete = async (l) => {
    if (!window.confirm(`Delete LPO ${l.lpoNumber}?`)) return;
    try { await api.delete(`/fresh-customer-lpos/${l._id}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  // Group by day created
  const grouped = useMemo(() => {
    const map = new Map();
    for (const l of lpos) {
      const k = dayKey(l.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(l);
    }
    return Array.from(map.entries());
  }, [lpos]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-primary" /> Customer LPOs</h1>
          <p className="text-sm text-muted-foreground mt-1">Orders received from customers. Use Quick mode for fast entry, Detailed for itemised LPOs.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4" /> New LPO / Batch</Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 rounded-xl border border-rekker-border bg-rekker-surface/40">
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] uppercase tracking-widest">Search LPO #</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-7 h-8" value={filter.search} onChange={(e) => setFilter(p => ({ ...p, search: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest">Status</Label>
          <Select value={filter.status || '__all'} onValueChange={(v) => setFilter(p => ({ ...p, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All</SelectItem>
              {['pending','delivered','partially_returned','fully_returned','closed','cancelled'].map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g,' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest">Created from</Label>
          <Input type="date" className="h-8" value={filter.startDate} onChange={(e) => setFilter(p => ({ ...p, startDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest">Created to</Label>
          <Input type="date" className="h-8" value={filter.endDate} onChange={(e) => setFilter(p => ({ ...p, endDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest">Delivery from</Label>
          <Input type="date" className="h-8" value={filter.deliveryStart} onChange={(e) => setFilter(p => ({ ...p, deliveryStart: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest">Delivery to</Label>
          <Input type="date" className="h-8" value={filter.deliveryEnd} onChange={(e) => setFilter(p => ({ ...p, deliveryEnd: e.target.value }))} />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-rekker-surface animate-pulse" />)}</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <p className="text-sm text-muted-foreground">No LPOs match your filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, list]) => {
            const isC = collapsed[day];
            const dayTotal = list.reduce((a, l) => a + Number(l.totalValue || 0), 0);
            const dayNet   = list.reduce((a, l) => a + Number(l.netValue   || 0), 0);
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
                    Total <span className="text-foreground">KES {dayTotal.toLocaleString()}</span>
                    <span className="mx-2">·</span>
                    Net <span className="text-primary">KES {dayNet.toLocaleString()}</span>
                  </div>
                </button>
                {!isC && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-rekker-surface/60">
                        <tr>
                          {['LPO #','Customer','Mode','Total','Net','Status','Delivery','Actions'].map((h) => (
                            <th key={h} className="text-left px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((l) => (
                          <tr key={l._id} className="border-t border-rekker-border/40 hover:bg-accent/20">
                            <td className="px-4 py-2 font-mono text-primary">{l.lpoNumber}</td>
                            <td className="px-4 py-2">{l.customer?.name || l.customerNameRaw || '—'}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{(l.items?.length || 0) > 0 ? `${l.items.length} item(s)` : 'Quick'}</td>
                            <td className="px-4 py-2 font-mono">{Number(l.totalValue||0).toLocaleString()}</td>
                            <td className="px-4 py-2 font-mono text-primary">{Number(l.netValue||0).toLocaleString()}</td>
                            <td className="px-4 py-2"><Badge variant={STATUS_VARIANT[l.status] || 'outline'}>{l.status.replace(/_/g,' ')}</Badge></td>
                            <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{l.deliveryDate ? format(new Date(l.deliveryDate), 'dd/MM/yy') : '—'}</td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}>
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => onDelete(l)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
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

      <LpoModal open={open} onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={handleSaved} branches={branches} editing={editing} />
    </div>
  );
}
