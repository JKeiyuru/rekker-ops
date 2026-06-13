// client/src/pages/manufacturing/ProductsPage.jsx

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Boxes, Edit2, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/api';
import toast from 'react-hot-toast';

function ProductModal({ open, onClose, product, onSaved }) {
  const blank = { name: '', sku: '', category: '', volume: '', unitDescription: '', piecesPerCarton: 12, vatRate: 0.16, notes: '' };
  const [f, setF] = useState(blank);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (product) setF({ ...blank, ...product, vatRate: product.vatRate ?? 0.16 });
    else setF(blank);
  }, [product, open]);
  const save = async () => {
    if (!f.name.trim()) return toast.error('Name required');
    setLoading(true);
    try {
      const payload = { ...f, piecesPerCarton: Number(f.piecesPerCarton) || 1, vatRate: Number(f.vatRate) || 0 };
      const res = product ? await api.put(`/products/${product._id}`, payload) : await api.post('/products', payload);
      onSaved(res.data, !product); toast.success('Saved'); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'New Product'}</DialogTitle>
          <DialogDescription>Define the product. Set BOM in the product detail page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name} onChange={(e) => setF((p) => ({...p, name: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>SKU</Label><Input value={f.sku} className="font-mono" onChange={(e) => setF((p) => ({...p, sku: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Category</Label><Input value={f.category} onChange={(e) => setF((p) => ({...p, category: e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Volume / size</Label><Input value={f.volume} placeholder="e.g. 500 ml" onChange={(e) => setF((p) => ({...p, volume: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>Unit description</Label><Input value={f.unitDescription} placeholder="bottle, pack…" onChange={(e) => setF((p) => ({...p, unitDescription: e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Pieces per carton</Label><Input type="number" min="1" value={f.piecesPerCarton} onChange={(e) => setF((p) => ({...p, piecesPerCarton: e.target.value}))} /></div>
            <div className="space-y-1.5"><Label>VAT rate (0.16 = 16%)</Label><Input type="number" step="0.01" min="0" value={f.vatRate} onChange={(e) => setF((p) => ({...p, vatRate: e.target.value}))} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF((p) => ({...p, notes: e.target.value}))} /></div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductsPage() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = () => api.get('/products').then((r) => setList(r.data || []));
  useEffect(() => { load(); }, []);

  const handleSaved = (p, isNew) => { if (isNew) setList((x) => [p, ...x]); else setList((x) => x.map((y) => y._id === p._id ? p : y)); };
  const remove = async (p) => { if (!window.confirm(`Delete ${p.name}?`)) return; await api.delete(`/products/${p._id}`); setList((x) => x.filter((y) => y._id !== p._id)); toast.success('Deleted'); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><Boxes className="w-6 h-6 text-primary" /> Products</h1>
          <p className="text-sm text-muted-foreground mt-1">Click a product to edit its BOM (recipe + packaging) and view costing history.</p>
        </div>
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="w-4 h-4" /> New Product</Button>
      </div>
      {list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl border-rekker-border"><p className="text-sm text-muted-foreground">No products yet.</p></div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-rekker-surface"><tr>{['Name','SKU','Volume','Pcs/Ctn','VAT','Unit cost','Sell (excl)',''].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                  <td className="px-4 py-2.5"><Link to={`/manufacturing/products/${p._id}`} className="font-medium hover:text-primary inline-flex items-center gap-1">{p.name} <ExternalLink className="w-3 h-3 opacity-50" /></Link></td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.sku || '—'}</td>
                  <td className="px-4 py-2.5">{p.volume || '—'}</td>
                  <td className="px-4 py-2.5 font-mono">{p.piecesPerCarton}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{((p.vatRate ?? 0.16) * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2.5 font-mono text-primary">KES {Number(p.currentUnitCost || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-mono">{p.currentPricing ? `KES ${Number(p.currentPricing.unitPriceExclVAT).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2.5 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEdit(p); setOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => remove(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ProductModal open={open} onClose={() => setOpen(false)} product={edit} onSaved={handleSaved} />
    </div>
  );
}
