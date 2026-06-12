// client/src/pages/manufacturing/GoodsReceiptsPage.jsx
// Records incoming material from suppliers. Bumps stock + price history.

import { useEffect, useState } from 'react';
import { Plus, X, PackagePlus, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

function ReceiptModal({ open, onClose, suppliers, materials, onSaved }) {
  const blankLine = () => ({ material: '', qty: 0, unitPrice: 0, notes: '' });
  const [supplier, setSupplier] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [items, setItems] = useState([blankLine()]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setSupplier(''); setInvoiceRef(''); setReceivedAt(new Date().toISOString().slice(0,16)); setItems([blankLine()]); setNotes(''); } }, [open]);

  const matMap = Object.fromEntries(materials.map(m => [m._id, m]));
  const total = items.reduce((s, l) => s + Number(l.qty||0) * Number(l.unitPrice||0), 0);

  const updateLine = (i, patch) => setItems(p => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setItems(p => [...p, blankLine()]);
  const removeLine = (i) => setItems(p => p.filter((_, idx) => idx !== i));

  const onPickMaterial = (i, id) => {
    const m = matMap[id];
    updateLine(i, { material: id, unitPrice: m?.currentUnitPrice || 0 });
  };

  const save = async () => {
    if (!supplier) return toast.error('Supplier required');
    if (!items.length || items.some(l => !l.material || !(Number(l.qty) > 0))) return toast.error('Each line needs a material + qty > 0');
    setLoading(true);
    try {
      const res = await api.post('/goods-receipts', {
        supplier, invoiceRef, receivedAt, notes,
        items: items.map(l => ({ material: l.material, qty: Number(l.qty), unitPrice: Number(l.unitPrice), notes: l.notes })),
      });
      onSaved(res.data); toast.success('Receipt recorded'); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Record Goods Receipt</DialogTitle><DialogDescription>Stock will be added; if a unit price differs from the current one, price history is created and product costs are recomputed.</DialogDescription></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Supplier invoice/DN ref</Label><Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="optional" /></div>
            <div className="space-y-1.5"><Label>Received at</Label><Input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></div>
          </div>

          <div className="rounded-xl border border-rekker-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-3.5 h-3.5" /> Add line</Button>
            </div>
            {items.map((l, i) => {
              const m = matMap[l.material];
              const lineTotal = Number(l.qty||0) * Number(l.unitPrice||0);
              const diff = m && Number(l.unitPrice) !== Number(m.currentUnitPrice) ? ((Number(l.unitPrice) - Number(m.currentUnitPrice))/Math.max(1e-6, Number(m.currentUnitPrice)))*100 : 0;
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Select value={l.material} onValueChange={(v) => onPickMaterial(i, v)}>
                      <SelectTrigger><SelectValue placeholder="Material…" /></SelectTrigger>
                      <SelectContent>{materials.map(mat => <SelectItem key={mat._id} value={mat._id}>{mat.name} ({mat.unit}) · stock {Number(mat.currentStock||0).toFixed(1)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Input type="number" min="0" step="any" placeholder="Qty" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></div>
                  <div className="col-span-2"><Input type="number" min="0" step="any" placeholder="Unit price" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} /></div>
                  <div className="col-span-2 text-xs font-mono text-primary">KES {lineTotal.toFixed(2)}{diff !== 0 && <span className={`block text-[10px] ${diff>0?'text-red-500':'text-emerald-500'}`}>{diff>0?'+':''}{diff.toFixed(1)}% vs current</span>}</div>
                  <div className="col-span-1 flex justify-end">{items.length > 1 && <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => removeLine(i)}><X className="w-3.5 h-3.5" /></Button>}</div>
                </div>
              );
            })}
            <div className="text-right text-sm font-mono">Total: <span className="text-primary font-bold">KES {total.toFixed(2)}</span></div>
          </div>

          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save Receipt</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function GoodsReceiptsPage() {
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => Promise.all([
    api.get('/goods-receipts'),
    api.get('/material-suppliers'),
    api.get('/materials'),
  ]).then(([r, s, m]) => { setList(r.data || []); setSuppliers(s.data || []); setMaterials(m.data || []); });
  useEffect(() => { load(); }, []);

  const onSaved = (r) => { setList(p => [r, ...p]); load(); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><PackagePlus className="w-6 h-6 text-primary" /> Goods Receipts</h1>
          <p className="text-sm text-muted-foreground mt-1">Record incoming materials. Each receipt bumps stock and updates supplier price history.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> New Receipt</Button>
      </div>
      {list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl border-rekker-border"><p className="text-sm text-muted-foreground">No receipts yet.</p></div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-rekker-surface"><tr>{['Receipt #','Date','Supplier','Items','Total','Invoice Ref','Received by'].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r._id} className="border-t border-rekker-border/50 hover:bg-accent/20 align-top">
                  <td className="px-4 py-3 font-mono text-primary">{r.receiptNumber}</td>
                  <td className="px-4 py-3 text-xs font-mono">{format(new Date(r.receivedAt), 'dd MMM yyyy HH:mm')}</td>
                  <td className="px-4 py-3 inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-muted-foreground" /> {r.supplier?.name || '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    <ul className="space-y-0.5">
                      {r.items.map((it, i) => <li key={i} className="text-muted-foreground">{it.material?.name || '—'} <span className="font-mono">× {Number(it.qty).toFixed(2)} {it.unit}</span> @ {Number(it.unitPrice).toFixed(2)}</li>)}
                    </ul>
                  </td>
                  <td className="px-4 py-3 font-mono text-primary">KES {Number(r.totalCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-xs">{r.invoiceRef || '—'}</td>
                  <td className="px-4 py-3 text-xs">{r.receivedBy?.fullName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ReceiptModal open={open} onClose={() => setOpen(false)} suppliers={suppliers} materials={materials} onSaved={onSaved} />
    </div>
  );
}
