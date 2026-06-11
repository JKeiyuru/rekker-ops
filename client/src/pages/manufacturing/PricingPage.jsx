// client/src/pages/manufacturing/PricingPage.jsx
// Admin-only: set selling prices per product.

import { useEffect, useState } from 'react';
import { Tag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/api';
import toast from 'react-hot-toast';

function PriceModal({ open, onClose, product, onSaved }) {
  const [excl, setExcl] = useState(0); const [vat, setVat] = useState(0.16); const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open && product) {
      const cur = product.currentPricing;
      setExcl(cur?.unitPriceExclVAT || 0); setVat(cur?.vatRate ?? 0.16); setNotes('');
    }
  }, [open, product]);

  const incl = Number(excl || 0) * (1 + Number(vat || 0));
  const carton = Number(excl || 0) * Number(product?.piecesPerCarton || 1);
  const cartonIncl = incl * Number(product?.piecesPerCarton || 1);
  const cost = Number(product?.currentUnitCost || 0);
  const margin = excl > 0 ? ((excl - cost) / excl) * 100 : 0;

  const save = async () => {
    if (!(Number(excl) > 0)) return toast.error('Price must be > 0');
    setLoading(true);
    try {
      const res = await api.post(`/products/${product._id}/pricing`, { unitPriceExclVAT: Number(excl), vatRate: Number(vat), notes });
      onSaved(res.data.product); toast.success('Pricing saved'); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  if (!product) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{product.name}</DialogTitle><DialogDescription>Set selling price (VAT exclusive). Carton + VAT-inclusive prices auto-compute.</DialogDescription></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="rounded-lg border border-rekker-border p-3 text-sm">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Current unit cost</p>
            <p className="text-2xl font-bold text-primary">KES {cost.toFixed(2)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Unit price excl VAT</Label><Input type="number" min="0" step="any" value={excl} onChange={(e) => setExcl(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>VAT rate (0.16 = 16%)</Label><Input type="number" min="0" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
          </div>
          <div className="rounded-lg border border-rekker-border p-3 text-xs font-mono space-y-1">
            <p>Unit incl VAT: <span className="text-primary">KES {incl.toFixed(2)}</span></p>
            <p>Carton ({product.piecesPerCarton} pcs) excl: <span className="text-primary">KES {carton.toFixed(2)}</span></p>
            <p>Carton incl: <span className="text-primary">KES {cartonIncl.toFixed(2)}</span></p>
            <p>Unit margin: <span className={margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{margin.toFixed(1)}%</span></p>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — why this change…" /></div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save Price</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PricingPage() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/products').then((r) => setList(r.data || []));
  useEffect(load, []);

  const onSaved = (p) => setList((x) => x.map((y) => y._id === p._id ? p : y));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><Tag className="w-6 h-6 text-primary" /> Product Pricing</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin-only. Sets unit selling price; VAT-inclusive + carton prices auto-compute.</p>
      </div>
      {list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl"><p className="text-sm text-muted-foreground">No products yet.</p></div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-rekker-surface"><tr>{['Product','Pcs/Ctn','Cost','Unit excl','Unit incl','Carton excl','Carton incl','Margin',''].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((p) => {
                const pr = p.currentPricing;
                const margin = pr && pr.unitPriceExclVAT > 0 ? ((pr.unitPriceExclVAT - (p.currentUnitCost || 0)) / pr.unitPriceExclVAT) * 100 : null;
                return (
                  <tr key={p._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                    <td className="px-4 py-2.5 font-medium">{p.name} <span className="text-xs text-muted-foreground">{p.volume}</span></td>
                    <td className="px-4 py-2.5 font-mono">{p.piecesPerCarton}</td>
                    <td className="px-4 py-2.5 font-mono">{Number(p.currentUnitCost || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-mono">{pr ? Number(pr.unitPriceExclVAT).toFixed(2) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono">{pr ? Number(pr.unitPriceInclVAT).toFixed(2) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono">{pr ? Number(pr.cartonPriceExclVAT).toFixed(2) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono">{pr ? Number(pr.cartonPriceInclVAT).toFixed(2) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono"><span className={margin == null ? '' : margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{margin == null ? '—' : `${margin.toFixed(1)}%`}</span></td>
                    <td className="px-4 py-2.5"><Button size="sm" variant="outline" onClick={() => setEditing(p)}>{pr ? 'Update' : 'Set price'}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <PriceModal open={!!editing} onClose={() => setEditing(null)} product={editing} onSaved={onSaved} />
    </div>
  );
}
