// client/src/pages/manufacturing/ProductDetailPage.jsx

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Save, Loader2, Beaker, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const blankEntry = () => ({ material: '', qtyPerUnit: 0 });

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [bomHistory, setBomHistory] = useState([]);
  const [pricingHistory, setPricingHistory] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [entries, setEntries] = useState([blankEntry()]);
  const [labor, setLabor] = useState(0);
  const [packaging, setPackaging] = useState(0);
  const [overhead, setOverhead] = useState(0);
  const [bomNotes, setBomNotes] = useState('');

  const load = async () => {
    setLoading(true);
    const [d, m] = await Promise.all([api.get(`/products/${id}`), api.get('/materials')]);
    setProduct(d.data.product); setBomHistory(d.data.bomHistory || []); setPricingHistory(d.data.pricingHistory || []);
    setMaterials(m.data || []);
    const cur = d.data.bomHistory?.[0];
    if (cur) {
      setEntries(cur.entries.map((e) => ({ material: e.material, qtyPerUnit: e.qtyPerUnit })));
      setLabor(cur.laborCostPerUnit); setPackaging(cur.packagingCostPerUnit); setOverhead(cur.overheadCostPerUnit);
    } else setEntries([blankEntry()]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const matMap = Object.fromEntries(materials.map((m) => [m._id, m]));
  const materialsCost = entries.reduce((a, e) => a + Number(e.qtyPerUnit || 0) * Number(matMap[e.material]?.currentUnitPrice || 0), 0);
  const unitCost = materialsCost + Number(labor || 0) + Number(packaging || 0) + Number(overhead || 0);

  const updateEntry = (i, patch) => setEntries((p) => p.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  const addEntry = () => setEntries((p) => [...p, blankEntry()]);
  const removeEntry = (i) => setEntries((p) => p.filter((_, idx) => idx !== i));

  const saveBOM = async () => {
    if (entries.some((e) => !e.material || !(Number(e.qtyPerUnit) > 0))) return toast.error('Every BOM line needs a material and qty > 0');
    setSaving(true);
    try {
      const res = await api.post(`/products/${id}/bom`, {
        entries: entries.map((e) => ({ material: e.material, qtyPerUnit: Number(e.qtyPerUnit) })),
        laborCostPerUnit: Number(labor) || 0,
        packagingCostPerUnit: Number(packaging) || 0,
        overheadCostPerUnit: Number(overhead) || 0,
        notes: bomNotes,
      });
      setProduct(res.data.product);
      setBomNotes(''); toast.success('BOM saved');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  if (loading || !product) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Link to="/manufacturing/products" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> All products</Link>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">{product.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {product.volume && <>{product.volume} · </>}{product.unitDescription && <>{product.unitDescription} · </>}
            {product.piecesPerCarton} pcs/carton
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Current unit cost</p>
          <p className="text-3xl font-bold text-primary">KES {Number(product.currentUnitCost || 0).toFixed(2)}</p>
          {product.currentPricing && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Sell: KES {Number(product.currentPricing.unitPriceExclVAT).toFixed(2)} excl · {Number(product.currentPricing.unitPriceInclVAT).toFixed(2)} incl
            </p>
          )}
        </div>
      </div>

      <Tabs defaultValue="bom">
        <TabsList>
          <TabsTrigger value="bom">BOM editor</TabsTrigger>
          <TabsTrigger value="bomHistory">BOM history ({bomHistory.length})</TabsTrigger>
          <TabsTrigger value="pricing">Pricing history ({pricingHistory.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bom" className="space-y-4">
          <div className="rounded-xl border border-rekker-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1"><Beaker className="w-4 h-4" /> Materials per unit</Label>
              <Button size="sm" variant="outline" onClick={addEntry}><Plus className="w-3.5 h-3.5" /> Add</Button>
            </div>
            <div className="space-y-2">
              {entries.map((e, i) => {
                const mat = matMap[e.material];
                const line = Number(e.qtyPerUnit || 0) * Number(mat?.currentUnitPrice || 0);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Select value={e.material} onValueChange={(v) => updateEntry(i, { material: v })}>
                        <SelectTrigger><SelectValue placeholder="Material…" /></SelectTrigger>
                        <SelectContent>{materials.map((m) => <SelectItem key={m._id} value={m._id}>{m.name} ({m.unit}) · {Number(m.currentUnitPrice).toFixed(2)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Input type="number" min="0" step="any" value={e.qtyPerUnit} onChange={(ev) => updateEntry(i, { qtyPerUnit: ev.target.value })} placeholder="Qty/unit" /></div>
                    <div className="col-span-2 text-xs font-mono text-muted-foreground">{mat ? `${mat.unit} @ ${Number(mat.currentUnitPrice).toFixed(2)}` : ''}</div>
                    <div className="col-span-2 text-xs font-mono text-primary">KES {line.toFixed(2)}</div>
                    <div className="col-span-1 flex justify-end">{entries.length > 1 && <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => removeEntry(i)}><X className="w-3.5 h-3.5" /></Button>}</div>
                  </div>
                );
              })}
            </div>
            <div className="text-right text-xs font-mono text-muted-foreground">Materials subtotal: <span className="text-primary font-bold ml-2">KES {materialsCost.toFixed(2)}</span></div>
          </div>

          <div className="rounded-xl border border-rekker-border p-4 space-y-3">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Other unit costs</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Labor / unit</Label><Input type="number" min="0" step="any" value={labor} onChange={(e) => setLabor(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Packaging / unit</Label><Input type="number" min="0" step="any" value={packaging} onChange={(e) => setPackaging(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Overhead / unit</Label><Input type="number" min="0" step="any" value={overhead} onChange={(e) => setOverhead(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>BOM notes</Label><Textarea rows={2} value={bomNotes} onChange={(e) => setBomNotes(e.target.value)} placeholder="Optional — describe what changed…" /></div>
          </div>

          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Projected unit cost</p>
              <p className="text-3xl font-bold text-primary">KES {unitCost.toFixed(2)}</p>
            </div>
            <Button onClick={saveBOM} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save BOM revision</Button>
          </div>
        </TabsContent>

        <TabsContent value="bomHistory">
          {bomHistory.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No BOM revisions yet.</p> : (
            <ul className="divide-y divide-rekker-border rounded-xl border border-rekker-border">
              {bomHistory.map((b) => (
                <li key={b._id} className="px-4 py-3 text-sm flex items-center justify-between">
                  <div>
                    <p className="font-mono">Rev #{b.revision}</p>
                    <p className="text-xs text-muted-foreground">{b.entries.length} materials · labor {b.laborCostPerUnit} · pkg {b.packagingCostPerUnit} · oh {b.overheadCostPerUnit}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-primary">KES {Number(b.totalUnitCost).toFixed(2)}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{format(new Date(b.createdAt), 'dd/MM/yy HH:mm')}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="pricing">
          {pricingHistory.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No pricing set yet — admins can set it on the Pricing page.</p> : (
            <ul className="divide-y divide-rekker-border rounded-xl border border-rekker-border">
              {pricingHistory.map((p) => (
                <li key={p._id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1"><Tag className="w-3.5 h-3.5 text-primary" /> Unit: <span className="font-mono ml-1">KES {Number(p.unitPriceExclVAT).toFixed(2)}</span> excl / <span className="font-mono">{Number(p.unitPriceInclVAT).toFixed(2)}</span> incl</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{format(new Date(p.effectiveFrom), 'dd/MM/yy HH:mm')}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Carton: KES {Number(p.cartonPriceExclVAT).toFixed(2)} excl / {Number(p.cartonPriceInclVAT).toFixed(2)} incl · margin {Number(p.marginPct).toFixed(1)}% · by {p.setBy?.fullName || '—'}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
