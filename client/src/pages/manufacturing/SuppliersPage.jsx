// client/src/pages/manufacturing/SuppliersPage.jsx

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Building2, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/api';
import toast from 'react-hot-toast';

function SupplierModal({ open, onClose, supplier, onSaved }) {
  const blank = { name: '', contactName: '', phone: '', email: '', location: '', city: '', country: 'Kenya', taxPin: '', paymentTerms: '', notes: '' };
  const [f, setF] = useState(blank);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (supplier) setF({ ...blank, ...supplier });
    else setF(blank);
  }, [supplier, open]);
  const save = async () => {
    if (!f.name.trim()) return toast.error('Name required');
    setLoading(true);
    try {
      const res = supplier ? await api.put(`/material-suppliers/${supplier._id}`, f) : await api.post('/material-suppliers', f);
      onSaved(res.data, !supplier); toast.success('Saved'); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{supplier ? 'Edit Supplier' : 'New Supplier'}</DialogTitle><DialogDescription>Full supplier record — used by goods receipts and the supplier scorecard.</DialogDescription></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Company name</Label><Input value={f.name} onChange={(e) => setF((p) => ({...p, name: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Contact person</Label><Input value={f.contactName} onChange={(e) => setF((p) => ({...p, contactName: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF((p) => ({...p, phone: e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Email</Label><Input value={f.email} onChange={(e) => setF((p) => ({...p, email: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Tax PIN</Label><Input value={f.taxPin} className="font-mono" onChange={(e) => setF((p) => ({...p, taxPin: e.target.value}))} /></div>
          </div>
          <div className="space-y-1.5"><Label>Physical address</Label><Input value={f.location} onChange={(e) => setF((p) => ({...p, location: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>City</Label><Input value={f.city} onChange={(e) => setF((p) => ({...p, city: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Country</Label><Input value={f.country} onChange={(e) => setF((p) => ({...p, country: e.target.value}))} /></div>
          </div>
          <div className="space-y-1.5"><Label>Payment terms</Label><Input value={f.paymentTerms} onChange={(e) => setF((p) => ({...p, paymentTerms: e.target.value}))} placeholder="Net 30, COD, …" /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF((p) => ({...p, notes: e.target.value}))} /></div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScorecardModal({ open, onClose, supplier }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (open && supplier) api.get(`/material-suppliers/${supplier._id}/scorecard`).then((r) => setData(r.data)); }, [open, supplier]);
  if (!supplier) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Star className="w-4 h-4 text-amber-400" /> {supplier.name}</DialogTitle><DialogDescription>{supplier.location} {supplier.taxPin && `· PIN ${supplier.taxPin}`}</DialogDescription></DialogHeader>
        {!data ? <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p> : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-rekker-border p-3"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Price changes</p><p className="text-2xl font-bold">{data.summary.totalChanges}</p></div>
              <div className="rounded-lg border border-rekker-border p-3"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Increases</p><p className="text-2xl font-bold text-red-500">{data.summary.increases}</p></div>
              <div className="rounded-lg border border-rekker-border p-3"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Decreases</p><p className="text-2xl font-bold text-emerald-500">{data.summary.decreases}</p></div>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Materials supplied ({data.materials.length})</p>
              <ul className="divide-y divide-rekker-border rounded-lg border border-rekker-border">
                {data.materials.map(m => <li key={m._id} className="px-3 py-2 flex justify-between"><span>{m.name}</span><span className="font-mono text-xs">KES {Number(m.currentUnitPrice).toFixed(2)}/{m.unit}</span></li>)}
                {data.materials.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">None linked yet.</li>}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Recent price changes</p>
              <ul className="divide-y divide-rekker-border rounded-lg border border-rekker-border max-h-60 overflow-auto">
                {data.priceChanges.slice(0,20).map(p => <li key={p._id} className="px-3 py-2 text-xs flex justify-between"><span>{p.material?.name}</span><span className="font-mono">KES {Number(p.unitPrice).toFixed(2)} <span className={p.deltaPct>0?'text-red-500':p.deltaPct<0?'text-emerald-500':'text-muted-foreground'}>{p.deltaPct>0?'+':''}{Number(p.deltaPct||0).toFixed(1)}%</span></span></li>)}
                {data.priceChanges.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No changes recorded.</li>}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function SuppliersPage() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [score, setScore] = useState(null);

  const load = () => api.get('/material-suppliers').then((r) => setList(r.data || []));
  useEffect(() => { load(); }, []);

  const handleSaved = (s, isNew) => { if (isNew) setList((p) => [s, ...p]); else setList((p) => p.map((x) => x._id === s._id ? s : x)); };
  const remove = async (s) => { if (!window.confirm(`Delete ${s.name}?`)) return; await api.delete(`/material-suppliers/${s._id}`); setList((p) => p.filter((x) => x._id !== s._id)); toast.success('Deleted'); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><Building2 className="w-6 h-6 text-primary" /> Material Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">Where every production material comes from.</p>
        </div>
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="w-4 h-4" /> New Supplier</Button>
      </div>
      {list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl border-rekker-border"><p className="text-sm text-muted-foreground">No suppliers yet.</p></div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-rekker-surface"><tr>{['Name','Contact','Phone','Email','City','PIN','Terms',''].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                  <td className="px-4 py-2.5 font-medium"><button className="hover:text-primary text-left" onClick={() => setScore(s)}>{s.name}</button></td>
                  <td className="px-4 py-2.5">{s.contactName || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{s.phone || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{s.email || '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{s.city || s.location || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{s.taxPin || '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{s.paymentTerms || '—'}</td>
                  <td className="px-4 py-2.5 text-right space-x-1 whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setScore(s)} title="Scorecard"><Star className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEdit(s); setOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => remove(s)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SupplierModal open={open} onClose={() => setOpen(false)} supplier={edit} onSaved={handleSaved} />
      <ScorecardModal open={!!score} onClose={() => setScore(null)} supplier={score} />
    </div>
  );
}
