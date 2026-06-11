// client/src/pages/manufacturing/SuppliersPage.jsx

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/api';
import toast from 'react-hot-toast';

function SupplierModal({ open, onClose, supplier, onSaved }) {
  const [f, setF] = useState({ name: '', contactName: '', phone: '', email: '', location: '', paymentTerms: '', notes: '' });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (supplier) setF({ name: supplier.name||'', contactName: supplier.contactName||'', phone: supplier.phone||'', email: supplier.email||'', location: supplier.location||'', paymentTerms: supplier.paymentTerms||'', notes: supplier.notes||'' });
    else setF({ name: '', contactName: '', phone: '', email: '', location: '', paymentTerms: '', notes: '' });
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
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{supplier ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          {[
            ['name','Company Name'], ['contactName','Contact Person'], ['phone','Phone'],
            ['email','Email'], ['location','Location / Address'], ['paymentTerms','Payment Terms'],
          ].map(([k,l]) => (
            <div key={k} className="space-y-1.5"><Label>{l}</Label><Input value={f[k]} onChange={(e) => setF((p) => ({...p, [k]: e.target.value}))} /></div>
          ))}
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF((p) => ({...p, notes: e.target.value}))} /></div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SuppliersPage() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = () => api.get('/material-suppliers').then((r) => setList(r.data || []));
  useEffect(load, []);

  const handleSaved = (s, isNew) => {
    if (isNew) setList((p) => [s, ...p]); else setList((p) => p.map((x) => x._id === s._id ? s : x));
  };
  const remove = async (s) => {
    if (!window.confirm(`Delete ${s.name}?`)) return;
    await api.delete(`/material-suppliers/${s._id}`); setList((p) => p.filter((x) => x._id !== s._id)); toast.success('Deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><Building2 className="w-6 h-6 text-primary" /> Material Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">Companies we buy production materials from.</p>
        </div>
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="w-4 h-4" /> New Supplier</Button>
      </div>
      {list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl"><p className="text-sm text-muted-foreground">No suppliers yet.</p></div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-rekker-surface"><tr>{['Name','Contact','Phone','Email','Location','Terms',''].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5">{s.contactName || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{s.phone || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{s.email || '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{s.location || '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{s.paymentTerms || '—'}</td>
                  <td className="px-4 py-2.5 text-right space-x-1">
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
    </div>
  );
}
