// client/src/pages/manufacturing/MaterialsPage.jsx

import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Beaker, History, Loader2, AlertTriangle, Boxes, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'm', 'roll', 'pkt'];
const CATEGORIES = ['chemical', 'packaging', 'utility', 'consumable', 'other'];

function MaterialModal({ open, onClose, material, suppliers, onSaved }) {
  const [f, setF] = useState({
    name: '', sku: '', category: 'chemical', unit: 'kg',
    currentSupplier: '', currentUnitPrice: 0,
    currentStock: 0, minimumStock: 0, reorderQty: 0,
    priceReason: '', notes: '',
  });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (material) setF({
      name: material.name||'', sku: material.sku||'', category: material.category||'chemical', unit: material.unit||'kg',
      currentSupplier: material.currentSupplier?._id || material.currentSupplier || '',
      currentUnitPrice: material.currentUnitPrice || 0,
      currentStock: material.currentStock || 0,
      minimumStock: material.minimumStock || 0,
      reorderQty: material.reorderQty || 0,
      priceReason: '', notes: material.notes||'',
    });
    else setF({ name: '', sku: '', category: 'chemical', unit: 'kg', currentSupplier: '', currentUnitPrice: 0, currentStock: 0, minimumStock: 0, reorderQty: 0, priceReason: '', notes: '' });
  }, [material, open]);
  const save = async () => {
    if (!f.name.trim()) return toast.error('Name required');
    setLoading(true);
    try {
      const payload = {
        ...f,
        currentSupplier: f.currentSupplier || null,
        currentUnitPrice: Number(f.currentUnitPrice),
        currentStock: Number(f.currentStock),
        minimumStock: Number(f.minimumStock),
        reorderQty: Number(f.reorderQty),
      };
      const res = material ? await api.put(`/materials/${material._id}`, payload) : await api.post('/materials', payload);
      onSaved(res.data, !material); toast.success('Saved'); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{material ? 'Edit Material' : 'New Material'}</DialogTitle>
          <DialogDescription>Stock is bumped by goods receipts; min-stock drives reorder alerts.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name} onChange={(e) => setF((p) => ({...p, name: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>SKU</Label><Input value={f.sku} className="font-mono" onChange={(e) => setF((p) => ({...p, sku: e.target.value}))} /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={f.category} onValueChange={(v) => setF((p) => ({...p, category: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={f.unit} onValueChange={(v) => setF((p) => ({...p, unit: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Price / unit (KES)</Label><Input type="number" min="0" step="any" value={f.currentUnitPrice} onChange={(e) => setF((p) => ({...p, currentUnitPrice: e.target.value}))} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Preferred supplier</Label>
            <Select value={f.currentSupplier || '__none'} onValueChange={(v) => setF((p) => ({...p, currentSupplier: v === '__none' ? '' : v}))}>
              <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— none —</SelectItem>
                {suppliers.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5"><Label>Current stock</Label><Input type="number" min="0" step="any" value={f.currentStock} disabled={!!material} onChange={(e) => setF((p) => ({...p, currentStock: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Min stock</Label><Input type="number" min="0" step="any" value={f.minimumStock} onChange={(e) => setF((p) => ({...p, minimumStock: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Reorder qty</Label><Input type="number" min="0" step="any" value={f.reorderQty} onChange={(e) => setF((p) => ({...p, reorderQty: e.target.value}))} /></div>
          </div>
          {material && <p className="text-[10px] text-muted-foreground">Stock is changed via Goods Receipts or Stock Adjustment, not here.</p>}
          {material && (
            <div className="space-y-1.5"><Label>Reason for price change <span className="text-muted-foreground font-normal">(if any)</span></Label><Input value={f.priceReason} onChange={(e) => setF((p) => ({...p, priceReason: e.target.value}))} placeholder="e.g. supplier increase, new vendor…" /></div>
          )}
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF((p) => ({...p, notes: e.target.value}))} /></div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryModal({ open, onClose, material }) {
  const [items, setItems] = useState([]);
  useEffect(() => { if (open && material) api.get(`/materials/${material._id}/history`).then((r) => setItems(r.data || [])); }, [open, material]);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Price history — {material?.name}</DialogTitle></DialogHeader>
        {items.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No history yet.</p> : (
          <ul className="divide-y divide-rekker-border max-h-[60vh] overflow-auto">
            {items.map((h) => (
              <li key={h._id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono">KES {Number(h.unitPrice).toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground font-mono">{format(new Date(h.effectiveFrom), 'dd/MM/yy HH:mm')}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {h.previousPrice != null && <>was KES {Number(h.previousPrice).toFixed(2)} · </>}
                  {h.deltaPct ? <span className={h.deltaPct >= 0 ? 'text-red-500' : 'text-emerald-500'}>{h.deltaPct >= 0 ? '+' : ''}{h.deltaPct.toFixed(1)}%</span> : null}
                  {h.reason && <> · {h.reason}</>} · by {h.changedBy?.fullName || '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdjustStockModal({ open, onClose, material, onSaved }) {
  const [delta, setDelta] = useState(0); const [reason, setReason] = useState(''); const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) { setDelta(0); setReason(''); } }, [open]);
  if (!material) return null;
  const save = async () => {
    if (!Number(delta)) return toast.error('Delta must be non-zero');
    if (!reason.trim()) return toast.error('Reason required');
    setLoading(true);
    try {
      const res = await api.post(`/materials/${material._id}/adjust-stock`, { delta: Number(delta), reason });
      onSaved(res.data); toast.success('Stock adjusted'); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Adjust stock — {material.name}</DialogTitle><DialogDescription>Current: {material.currentStock} {material.unit}</DialogDescription></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Delta (+ to add, − to remove)</Label><Input type="number" step="any" value={delta} onChange={(e) => setDelta(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Stock-take correction, spillage, …" /></div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Apply</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MaterialsPage() {
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all|low|raw|packaging

  const load = () => Promise.all([api.get('/materials'), api.get('/material-suppliers')])
    .then(([m, s]) => { setList(m.data || []); setSuppliers(s.data || []); });
  useEffect(() => { load(); }, []);

  const handleSaved = (m, isNew) => { if (isNew) setList((p) => [m, ...p]); else setList((p) => p.map((x) => x._id === m._id ? m : x)); };
  const remove = async (m) => { if (!window.confirm(`Delete ${m.name}?`)) return; await api.delete(`/materials/${m._id}`); setList((p) => p.filter((x) => x._id !== m._id)); toast.success('Deleted'); };

  const filtered = useMemo(() => {
    let r = list;
    const t = q.trim().toLowerCase();
    if (t) r = r.filter(m => (m.name||'').toLowerCase().includes(t) || (m.sku||'').toLowerCase().includes(t));
    if (filter === 'low') r = r.filter(m => Number(m.minimumStock||0) > 0 && Number(m.currentStock||0) <= Number(m.minimumStock||0));
    if (filter === 'raw') r = r.filter(m => m.category !== 'packaging');
    if (filter === 'packaging') r = r.filter(m => m.category === 'packaging');
    return r;
  }, [list, q, filter]);

  const lowCount = list.filter(m => Number(m.minimumStock||0) > 0 && Number(m.currentStock||0) <= Number(m.minimumStock||0)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><Beaker className="w-6 h-6 text-primary" /> Materials</h1>
          <p className="text-sm text-muted-foreground mt-1">Raw + packaging materials, stock levels & prices.</p>
        </div>
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="w-4 h-4" /> New Material</Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {[['all','All',list.length],['low','Low stock',lowCount],['raw','Raw',list.filter(m=>m.category!=='packaging').length],['packaging','Packaging',list.filter(m=>m.category==='packaging').length]].map(([k,l,n]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border ${filter===k ? 'bg-primary/15 text-primary border-primary/30' : 'border-rekker-border text-muted-foreground hover:text-foreground'}`}>{l} <span className="opacity-60">({n})</span></button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl border-rekker-border"><p className="text-sm text-muted-foreground">No materials match.</p></div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-rekker-surface"><tr>{['Name','Category','Unit','Stock','Min','Price','Supplier',''].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((m) => {
                const low = Number(m.minimumStock||0) > 0 && Number(m.currentStock||0) <= Number(m.minimumStock||0);
                return (
                  <tr key={m._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                    <td className="px-4 py-2.5 font-medium">{m.name} {low && <AlertTriangle className="w-3.5 h-3.5 inline ml-1 text-amber-500" />}</td>
                    <td className="px-4 py-2.5"><Badge variant={m.category==='packaging' ? 'secondary' : 'outline'}>{m.category || '—'}</Badge></td>
                    <td className="px-4 py-2.5"><Badge variant="outline">{m.unit}</Badge></td>
                    <td className={`px-4 py-2.5 font-mono ${low ? 'text-amber-500 font-bold' : ''}`}>{Number(m.currentStock||0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{Number(m.minimumStock||0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-mono text-primary">KES {Number(m.currentUnitPrice || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-xs">{m.currentSupplier?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-right space-x-1 whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setAdjust(m)} title="Adjust stock"><Boxes className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setHist(m)} title="History"><History className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEdit(m); setOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => remove(m)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <MaterialModal open={open} onClose={() => setOpen(false)} material={edit} suppliers={suppliers} onSaved={handleSaved} />
      <HistoryModal open={!!hist} onClose={() => setHist(null)} material={hist} />
      <AdjustStockModal open={!!adjust} onClose={() => setAdjust(null)} material={adjust} onSaved={(m) => handleSaved(m, false)} />
    </div>
  );
}
