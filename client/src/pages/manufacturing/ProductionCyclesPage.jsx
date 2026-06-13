// client/src/pages/manufacturing/ProductionCyclesPage.jsx

import { useEffect, useState } from 'react';
import { Plus, BarChart3, CheckCircle2, Loader2, AlertTriangle, ExternalLink, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { exportProductionCyclePDF } from '@/lib/pdf';

const toLitres = (qty, unit = '') => {
  const u = String(unit).toLowerCase().replace(/\./g, '').trim();
  const n = Number(qty || 0);
  if (!(n > 0)) return 0;
  if (['l','lt','ltr','litre','litres','liter','liters'].includes(u)) return n;
  if (['ml','millilitre','millilitres','milliliter','milliliters'].includes(u)) return n / 1000;
  return 0;
};

const parseProductVolume = (volume = '') => {
  const match = String(volume).toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)\s*(ml|millilitres?|milliliters?|l|lt|ltr|litres?|liters?)/i);
  return match ? toLitres(match[1], match[2]) : 0;
};

function StartCycleModal({ open, onClose, products, onStarted }) {
  const [product, setProduct] = useState('');
  const [targetQty, setTargetQty] = useState(200);
  const [targetUnit, setTargetUnit] = useState('L');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [override, setOverride] = useState(false);

  useEffect(() => { if (open) { setProduct(''); setTargetQty(200); setTargetUnit('L'); setNotes(''); setPreview(null); setOverride(false); } }, [open]);

  const selected = products.find(p => p._id === product);
  const unitLitres = parseProductVolume(selected?.volume || '');
  const targetLitres = toLitres(targetQty, targetUnit);
  const expected = targetLitres > 0 && unitLitres > 0 ? targetLitres / unitLitres : Number(targetQty || 0);

  useEffect(() => {
    if (product && Number(expected) > 0) {
      api.get(`/production-cycles/preview/${product}/${Number(expected)}`).then(r => setPreview(r.data)).catch(() => setPreview(null));
    } else setPreview(null);
  }, [product, expected]);

  const save = async () => {
    if (!product) return toast.error('Pick a product');
    if (!(Number(expected) > 0)) return toast.error('Expected units must be > 0');
    setLoading(true);
    try {
      const res = await api.post('/production-cycles', { product, expectedUnits: Number(expected), targetOutputQty: Number(targetQty) || 0, targetOutputUnit: targetUnit, notes, allowStockNegative: override });
      onStarted(res.data); toast.success(`Cycle ${res.data.cycleNumber} started · Batch ${res.data.batchNumber}`); onClose();
    } catch (e) {
      const data = e.response?.data;
      if (data?.shortfalls) {
        toast.error(`Insufficient stock for ${data.shortfalls.length} material(s)`, { duration: 5000 });
      } else toast.error(data?.message || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Start Production Cycle</DialogTitle><DialogDescription>System uses the active BOM to compute material requirements and deduct stock automatically.</DialogDescription></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{products.filter(p => p.currentBOM).map(p => <SelectItem key={p._id} value={p._id}>{p.name} {p.volume && `· ${p.volume}`} — KES {Number(p.currentUnitCost||0).toFixed(2)}/unit</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Volume to produce</Label><Input type="number" min="0" step="any" value={targetQty} onChange={(e) => setTargetQty(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Volume unit</Label><Input value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} placeholder="L" /></div>
            <div className="rounded-lg border border-rekker-border bg-accent/30 px-3 py-2"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Sellable units</p><p className="text-lg font-bold">{Number(expected || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
          </div>

          {preview && (
            <div className="rounded-xl border border-rekker-border p-3 space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Required materials (auto-deducted on start)</p>
              <table className="w-full text-xs">
                <thead><tr><th className="text-left">Material</th><th className="text-right">Needed</th><th className="text-right">In stock</th><th className="text-right">After</th></tr></thead>
                <tbody>
                  {preview.lines.map((l, i) => (
                    <tr key={i} className={`border-t border-rekker-border/40 ${l.shortfall > 0 ? 'text-red-500' : ''}`}>
                      <td className="py-1">{l.materialName}</td>
                      <td className="py-1 text-right font-mono">{Number(l.consumed).toFixed(2)} {l.unit}</td>
                      <td className="py-1 text-right font-mono">{Number(l.stock).toFixed(2)}</td>
                      <td className="py-1 text-right font-mono">{(Number(l.stock) - Number(l.consumed)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!preview.ok && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p>Insufficient stock for one or more materials. Either receive goods first or override to start anyway (will result in negative stock).</p>
                    <label className="inline-flex items-center gap-2 mt-1 cursor-pointer"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Allow negative stock</label>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Start cycle</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductionCyclesPage() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => Promise.all([api.get('/production-cycles'), api.get('/products')]).then(([c, p]) => { setList(c.data || []); setProducts(p.data || []); });
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Production Cycles</h1>
          <p className="text-sm text-muted-foreground mt-1">Click a cycle to record actuals, QC checks, and complete it.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Start Cycle</Button>
      </div>
      {list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl border-rekker-border"><p className="text-sm text-muted-foreground">No cycles yet.</p></div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-rekker-surface"><tr>{['Cycle #','Batch #','Product','Expected','Produced','Cost/unit','Total','Status','Started',''].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {list.map(c => (
                <tr key={c._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                  <td className="px-4 py-2.5 font-mono text-primary"><Link to={`/manufacturing/cycles/${c._id}`} className="hover:underline inline-flex items-center gap-1">{c.cycleNumber} <ExternalLink className="w-3 h-3 opacity-50" /></Link></td>
                  <td className="px-4 py-2.5 font-mono text-xs">{c.batchNumber || '—'}</td>
                  <td className="px-4 py-2.5">{c.product?.name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono">{c.expectedUnits || 0}</td>
                  <td className="px-4 py-2.5 font-mono">{c.unitsProduced || 0}</td>
                  <td className="px-4 py-2.5 font-mono">KES {Number(c.costPerUnit||0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-mono text-primary">KES {Number(c.totalCost||0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5"><Badge variant={c.status==='running' ? 'warning' : c.status==='cancelled' ? 'destructive' : 'success'}>{c.status}</Badge></td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{format(new Date(c.startedAt), 'dd/MM HH:mm')}</td>
                  <td className="px-4 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => exportProductionCyclePDF(c)} title="PDF"><Download className="w-3.5 h-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <StartCycleModal open={open} onClose={() => setOpen(false)} products={products} onStarted={(c) => setList((p) => [c, ...p])} />
    </div>
  );
}
