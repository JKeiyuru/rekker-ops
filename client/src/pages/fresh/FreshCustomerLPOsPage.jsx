// client/src/pages/fresh/FreshCustomerLPOsPage.jsx

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, Copy, X, ShoppingCart, Layers, Loader2 } from 'lucide-react';
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
import { format } from 'date-fns';

const STATUS_VARIANT = {
  pending: 'secondary', delivered: 'default', partially_returned: 'warning',
  fully_returned: 'destructive', closed: 'outline', cancelled: 'outline',
};

const blankItem = () => ({ name: '', sku: '', unit: 'pcs', quantity: 1, unitPrice: 0 });
const blankLpo = () => ({
  lpoNumber: '', customer: '', customerNameRaw: '', deliveryLocation: '',
  deliveryDate: '', notes: '', items: [blankItem()],
});

// ── Batch modal ───────────────────────────────────────────────────────────────
function BatchModal({ open, onClose, onSaved, branches }) {
  const [mode, setMode] = useState('single'); // single | batch
  const [lpos, setLpos] = useState([blankLpo()]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setLpos([blankLpo()]); setMode('single'); } }, [open]);

  const updateLpo = (i, patch) => setLpos((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const updateItem = (li, ii, patch) => setLpos((p) => p.map((l, idx) => {
    if (idx !== li) return l;
    return { ...l, items: l.items.map((it, j) => j === ii ? { ...it, ...patch } : it) };
  }));
  const addItem = (li) => updateLpo(li, { items: [...lpos[li].items, blankItem()] });
  const removeItem = (li, ii) => updateLpo(li, { items: lpos[li].items.filter((_, j) => j !== ii) });

  const addLpo = () => setLpos((p) => [...p, blankLpo()]);
  const duplicateLpo = (i) => setLpos((p) => {
    const copy = JSON.parse(JSON.stringify(p[i]));
    copy.lpoNumber = '';
    return [...p, copy];
  });
  const removeLpo = (i) => setLpos((p) => p.filter((_, idx) => idx !== i));

  const totalOf = (l) => (l.items || []).reduce((a, it) => a + Number(it.quantity || 0) * Number(it.unitPrice || 0), 0);
  const grandTotal = lpos.reduce((a, l) => a + totalOf(l), 0);

  const validate = () => {
    for (const [i, l] of lpos.entries()) {
      if (!l.lpoNumber.trim()) return `LPO #${i+1}: number required`;
      if (!l.items.length) return `LPO #${i+1}: at least one item required`;
      for (const [j, it] of l.items.entries()) {
        if (!it.name.trim()) return `LPO #${i+1} item #${j+1}: name required`;
        if (!(Number(it.quantity) > 0)) return `LPO #${i+1} item #${j+1}: qty > 0`;
        if (!(Number(it.unitPrice) >= 0)) return `LPO #${i+1} item #${j+1}: price ≥ 0`;
      }
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setLoading(true);
    try {
      const payload = lpos.map((l) => ({
        ...l,
        customer: l.customer || null,
        items: l.items.map((it) => ({
          name: it.name, sku: it.sku, unit: it.unit,
          quantity: Number(it.quantity), unitPrice: Number(it.unitPrice),
        })),
      }));
      if (mode === 'single' && payload.length === 1) {
        const res = await api.post('/fresh-customer-lpos', payload[0]);
        onSaved([res.data]);
      } else {
        const res = await api.post('/fresh-customer-lpos/batch', { lpos: payload });
        onSaved(res.data.lpos || []);
      }
      toast.success(payload.length > 1 ? `Batch of ${payload.length} created` : 'LPO created');
      onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'batch' ? 'New LPO Batch' : 'New Customer LPO'}</DialogTitle>
          <DialogDescription>Enter one or many customer LPOs. Use “Add another LPO” to switch into batch mode.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-3">
          {lpos.map((l, li) => {
            const total = totalOf(l);
            return (
              <div key={li} className="rounded-xl border border-rekker-border p-4 space-y-4 bg-rekker-surface/40">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    LPO {lpos.length > 1 ? `#${li+1}` : ''}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => duplicateLpo(li)}>
                      <Copy className="w-3.5 h-3.5" /> Duplicate
                    </Button>
                    {lpos.length > 1 && (
                      <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => removeLpo(li)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label>LPO #</Label>
                    <Input value={l.lpoNumber} onChange={(e) => updateLpo(li, { lpoNumber: e.target.value.toUpperCase() })} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Customer (branch)</Label>
                    <Select value={l.customer || '__none'} onValueChange={(v) => updateLpo(li, { customer: v === '__none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— none —</SelectItem>
                        {branches.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Or customer name</Label>
                    <Input value={l.customerNameRaw} onChange={(e) => updateLpo(li, { customerNameRaw: e.target.value })} placeholder="Walk-in / shop name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Delivery date</Label>
                    <Input type="date" value={l.deliveryDate} onChange={(e) => updateLpo(li, { deliveryDate: e.target.value })} />
                  </div>
                  <div className="col-span-2 md:col-span-4 space-y-1.5">
                    <Label>Delivery location</Label>
                    <Input value={l.deliveryLocation} onChange={(e) => updateLpo(li, { deliveryLocation: e.target.value })} placeholder="Address / landmark" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Items</Label>
                    <Button size="sm" variant="outline" onClick={() => addItem(li)}><Plus className="w-3.5 h-3.5" /> Add item</Button>
                  </div>
                  <div className="space-y-2">
                    {l.items.map((it, ii) => (
                      <div key={ii} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4"><Input placeholder="Item name" value={it.name} onChange={(e) => updateItem(li, ii, { name: e.target.value })} /></div>
                        <div className="col-span-2"><Input placeholder="SKU" value={it.sku} onChange={(e) => updateItem(li, ii, { sku: e.target.value })} className="font-mono" /></div>
                        <div className="col-span-1"><Input placeholder="Unit" value={it.unit} onChange={(e) => updateItem(li, ii, { unit: e.target.value })} /></div>
                        <div className="col-span-2"><Input type="number" min="0" step="any" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(li, ii, { quantity: e.target.value })} /></div>
                        <div className="col-span-2"><Input type="number" min="0" step="any" placeholder="Unit price" value={it.unitPrice} onChange={(e) => updateItem(li, ii, { unitPrice: e.target.value })} /></div>
                        <div className="col-span-1 flex justify-end">
                          {l.items.length > 1 && (
                            <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => removeItem(li, ii)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-rekker-border/50">
                  <Textarea rows={1} placeholder="Notes…" value={l.notes} onChange={(e) => updateLpo(li, { notes: e.target.value })} className="max-w-md" />
                  <p className="text-sm font-mono"><span className="text-muted-foreground">Total</span> <span className="text-primary font-bold ml-2">KES {total.toLocaleString()}</span></p>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => { addLpo(); setMode('batch'); }}>
              <Layers className="w-4 h-4" /> Add another LPO
            </Button>
            <p className="text-sm font-mono">
              <span className="text-muted-foreground">{lpos.length} LPO{lpos.length>1?'s':''} · Grand total</span>
              <span className="text-primary font-bold ml-2">KES {grandTotal.toLocaleString()}</span>
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={save} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {lpos.length > 1 ? `Create batch (${lpos.length})` : 'Create LPO'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FreshCustomerLPOsPage() {
  const [lpos, setLpos] = useState([]);
  const [batches, setBatches] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState({ status: '', batchId: '' });

  const load = async () => {
    setLoading(true);
    const params = {};
    if (filter.status)  params.status = filter.status;
    if (filter.batchId) params.batchId = filter.batchId;
    const [a, b, br] = await Promise.all([
      api.get('/fresh-customer-lpos', { params }),
      api.get('/fresh-customer-lpos/batches'),
      api.get('/branches'),
    ]);
    setLpos(a.data || []); setBatches(b.data || []); setBranches(br.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter.status, filter.batchId]);

  const handleSaved = (created) => {
    setLpos((p) => [...created, ...p]);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-primary" /> Customer LPOs</h1>
          <p className="text-sm text-muted-foreground mt-1">LPOs received from customers for fresh produce deliveries.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> New LPO / Batch</Button>
      </div>

      <Tabs defaultValue="lpos">
        <TabsList>
          <TabsTrigger value="lpos">LPOs ({lpos.length})</TabsTrigger>
          <TabsTrigger value="batches">Batches ({batches.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lpos" className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={filter.status || '__all'} onValueChange={(v) => setFilter((p) => ({ ...p, status: v === '__all' ? '' : v }))}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All</SelectItem>
                  {['pending','delivered','partially_returned','fully_returned','closed','cancelled'].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filter.batchId && (
              <Button variant="outline" size="sm" onClick={() => setFilter((p) => ({ ...p, batchId: '' }))}>
                <X className="w-3.5 h-3.5" /> Clear batch filter
              </Button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-rekker-surface animate-pulse" />)}</div>
          ) : lpos.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-xl">
              <p className="text-sm text-muted-foreground">No LPOs yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-rekker-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-rekker-surface">
                  <tr>
                    {['LPO #','Customer','Items','Total','Net','Status','Date','Batch'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lpos.map((l) => (
                    <tr key={l._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                      <td className="px-4 py-2.5 font-mono text-primary">{l.lpoNumber}</td>
                      <td className="px-4 py-2.5">{l.customer?.name || l.customerNameRaw || '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{l.items?.length || 0}</td>
                      <td className="px-4 py-2.5 font-mono">{Number(l.totalValue||0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-mono text-primary">{Number(l.netValue||0).toLocaleString()}</td>
                      <td className="px-4 py-2.5"><Badge variant={STATUS_VARIANT[l.status] || 'outline'}>{l.status.replace('_',' ')}</Badge></td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{format(new Date(l.date), 'dd/MM/yy')}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                        {l.batchId
                          ? <button className="underline hover:text-primary" onClick={() => setFilter((p) => ({ ...p, batchId: l.batchId }))}>{l.batchId.slice(0,8)}</button>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="batches" className="space-y-3">
          {batches.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-xl">
              <p className="text-sm text-muted-foreground">No batches yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-rekker-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-rekker-surface">
                  <tr>
                    {['Batch','# LPOs','Total','Net','Date','Statuses',''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.batchId} className="border-t border-rekker-border/50 hover:bg-accent/20">
                      <td className="px-4 py-2.5 font-mono text-primary">{b.batchId.slice(0,8)}</td>
                      <td className="px-4 py-2.5">{b.count}</td>
                      <td className="px-4 py-2.5 font-mono">{Number(b.total||0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-mono">{Number(b.net||0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{format(new Date(b.date), 'dd/MM/yy')}</td>
                      <td className="px-4 py-2.5 text-xs">{(b.statuses || []).join(', ')}</td>
                      <td className="px-4 py-2.5"><Button size="sm" variant="outline" onClick={() => setFilter((p) => ({ ...p, batchId: b.batchId }))}>View LPOs</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <BatchModal open={open} onClose={() => setOpen(false)} onSaved={handleSaved} branches={branches} />
    </div>
  );
}
