// client/src/pages/manufacturing/MaterialsPage.jsx

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Beaker, History, Loader2 } from 'lucide-react';
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

function MaterialModal({ open, onClose, material, suppliers, onSaved }) {
  const [f, setF] = useState({ name: '', sku: '', category: '', unit: 'kg', currentSupplier: '', currentUnitPrice: 0, priceReason: '', notes: '' });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (material) setF({
      name: material.name||'', sku: material.sku||'', category: material.category||'', unit: material.unit||'kg',
      currentSupplier: material.currentSupplier?._id || material.currentSupplier || '',
      currentUnitPrice: material.currentUnitPrice || 0, priceReason: '', notes: material.notes||'',
    });
    else setF({ name: '', sku: '', category: '', unit: 'kg', currentSupplier: '', currentUnitPrice: 0, priceReason: '', notes: '' });
  }, [material, open]);
  const save = async () => {
    if (!f.name.trim()) return toast.error('Name required');
    setLoading(true);
    try {
      const payload = { ...f, currentSupplier: f.currentSupplier || null, currentUnitPrice: Number(f.currentUnitPrice) };
      const res = material ? await api.put(`/materials/${material._id}`, payload) : await api.post('/materials', payload);
      onSaved(res.data, !material); toast.success('Saved'); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{material ? 'Edit Material' : 'New Material'}</DialogTitle>
          <DialogDescription>Price changes recalculate dependent product costs and notify admins.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name} onChange={(e) => setF((p) => ({...p, name: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>SKU</Label><Input value={f.sku} className="font-mono" onChange={(e) => setF((p) => ({...p, sku: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Category</Label><Input value={f.category} onChange={(e) => setF((p) => ({...p, category: e.target.value}))} /></div>
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
            <Label>Supplier</Label>
            <Select value={f.currentSupplier || '__none'} onValueChange={(v) => setF((p) => ({...p, currentSupplier: v === '__none' ? '' : v}))}>
              <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— none —</SelectItem>
                {suppliers.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
                  {h.deltaPct ? <span className={h.deltaPct >= 0 ? 'text-red-400' : 'text-emerald-400'}>{h.deltaPct >= 0 ? '+' : ''}{h.deltaPct.toFixed(1)}%</span> : null}
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

export default function MaterialsPage() {
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(null);

  const load = () => Promise.all([api.get('/materials'), api.get('/material-suppliers')])
    .then(([m, s]) => { setList(m.data || []); setSuppliers(s.data || []); });
  useEffect(() => { load(); }, []);

  const handleSaved = (m, isNew) => { if (isNew) setList((p) => [m, ...p]); else setList((p) => p.map((x) => x._id === m._id ? m : x)); };
  const remove = async (m) => { if (!window.confirm(`Delete ${m.name}?`)) return; await api.delete(`/materials/${m._id}`); setList((p) => p.filter((x) => x._id !== m._id)); toast.success('Deleted'); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><Beaker className="w-6 h-6 text-primary" /> Materials</h1>
          <p className="text-sm text-muted-foreground mt-1">Raw materials feeding into product BOMs.</p>
        </div>
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="w-4 h-4" /> New Material</Button>
      </div>
      {list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl"><p className="text-sm text-muted-foreground">No materials yet.</p></div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-rekker-surface"><tr>{['Name','SKU','Category','Unit','Price','Supplier',''].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                  <td className="px-4 py-2.5 font-medium">{m.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{m.sku || '—'}</td>
                  <td className="px-4 py-2.5">{m.category || '—'}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline">{m.unit}</Badge></td>
                  <td className="px-4 py-2.5 font-mono text-primary">KES {Number(m.currentUnitPrice || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-xs">{m.currentSupplier?.name || '—'}</td>
                  <td className="px-4 py-2.5 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setHist(m)}><History className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEdit(m); setOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => remove(m)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MaterialModal open={open} onClose={() => setOpen(false)} material={edit} suppliers={suppliers} onSaved={handleSaved} />
      <HistoryModal open={!!hist} onClose={() => setHist(null)} material={hist} />
    </div>
  );
}
