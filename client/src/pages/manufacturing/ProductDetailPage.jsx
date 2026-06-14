// client/src/pages/manufacturing/ProductDetailPage.jsx
// Product page: edit BOM (raw + packaging), browse revisions, restore versions, see pricing.

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Save, Loader2, Beaker, Tag, RotateCcw, Box, Calculator, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const blankEntry = (kind = 'raw') => ({ material: '', qtyPerUnit: 0, qtyPerBatch: 0, kind });

const toLitres = (qty, unit = '') => {
  const u = String(unit).toLowerCase().replace(/\./g, '').trim();
  const n = Number(qty || 0);
  if (!(n > 0)) return 0;
  if (['l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(u)) return n;
  if (['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'].includes(u)) return n / 1000;
  return 0;
};

const parseProductVolume = (volume = '') => {
  const match = String(volume).toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)\s*(ml|millilitres?|milliliters?|l|lt|ltr|litres?|liters?)/i);
  if (!match) return { label: volume || 'unit', litres: 0 };
  return { label: `${match[1]}${match[2]}`, litres: toLitres(match[1], match[2]) };
};

const money = (v) => `KES ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [bomHistory, setBomHistory] = useState([]);
  const [pricingHistory, setPricingHistory] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [entries, setEntries] = useState([blankEntry('raw')]);
  const [batchOutputQty, setBatchOutputQty] = useState(1);
  const [batchOutputUnit, setBatchOutputUnit] = useState('unit');
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
      setEntries(cur.entries.map((e) => ({ material: e.material?._id || e.material, qtyPerUnit: e.qtyPerUnit, qtyPerBatch: e.qtyPerBatch || 0, kind: e.kind || 'raw' })));
      setBatchOutputQty(cur.formulaOutputQty || cur.batchOutputQty || 1);
      setBatchOutputUnit(cur.formulaOutputUnit || cur.batchOutputUnit || 'unit');
      setLabor(cur.laborCostPerUnit); setPackaging(cur.packagingCostPerUnit); setOverhead(cur.overheadCostPerUnit);
    } else setEntries([blankEntry('raw')]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const matMap = Object.fromEntries(materials.map((m) => [m._id, m]));
  const productVolume = parseProductVolume(product?.volume || '');
  const formulaLitres = toLitres(batchOutputQty, batchOutputUnit);
  const sellableUnits = formulaLitres > 0 && productVolume.litres > 0 ? formulaLitres / productVolume.litres : Number(batchOutputQty || 0);
  const outputUnits = sellableUnits > 0 ? sellableUnits : 1;
  // Auto compute qtyPerUnit from the formula batch if output units > 0
  const qtyPerUnitFor = (e) => {
    if (Number(e.qtyPerBatch) > 0 && outputUnits > 0) return Number(e.qtyPerBatch) / outputUnits;
    return Number(e.qtyPerUnit || 0);
  };
  const rawCost = entries.filter(e => e.kind !== 'packaging').reduce((a, e) => a + qtyPerUnitFor(e) * Number(matMap[e.material]?.currentUnitPrice || 0), 0);
  const packCost = entries.filter(e => e.kind === 'packaging').reduce((a, e) => a + qtyPerUnitFor(e) * Number(matMap[e.material]?.currentUnitPrice || 0), 0);
  const unitCost = rawCost + packCost + Number(labor || 0) + Number(packaging || 0) + Number(overhead || 0);
  const costPerLitreMaterials = productVolume.litres > 0 ? rawCost / productVolume.litres : 0;

  const updateEntry = (i, patch) => setEntries((p) => p.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  const addEntry = (kind) => setEntries((p) => [...p, blankEntry(kind)]);
  const removeEntry = (i) => setEntries((p) => p.filter((_, idx) => idx !== i));

  const saveBOM = async () => {
    if (entries.some((e) => !e.material)) return toast.error('Every BOM line needs a material');
    setSaving(true);
    try {
      const res = await api.post(`/products/${id}/bom`, {
        formulaOutputQty: Number(batchOutputQty) || 0,
        formulaOutputUnit: batchOutputUnit,
        batchOutputQty: outputUnits,
        batchOutputUnit: product.unitDescription || 'unit',
        entries: entries.map((e) => ({
          material: e.material,
          qtyPerUnit: qtyPerUnitFor(e),
          qtyPerBatch: Number(e.qtyPerBatch) || 0,
          kind: e.kind,
        })),
        laborCostPerUnit: Number(labor) || 0,
        packagingCostPerUnit: Number(packaging) || 0,
        overheadCostPerUnit: Number(overhead) || 0,
        notes: bomNotes,
      });
      setProduct(res.data.product);
      setBomNotes(''); toast.success('BOM revision saved');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  const activateRev = async (bomId) => {
    if (!window.confirm('Restore this BOM revision as the active one?')) return;
    try { const res = await api.post(`/products/${id}/bom/${bomId}/activate`); setProduct(res.data.product); toast.success('Activated'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
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
            {product.piecesPerCarton} pcs/carton · VAT {(Number(product.vatRate || 0.16) * 100).toFixed(0)}%
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
          <TabsTrigger value="bomHistory">Revisions ({bomHistory.length})</TabsTrigger>
          <TabsTrigger value="pricing">Pricing history ({pricingHistory.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bom" className="space-y-4">
          <div className="rounded-xl border border-rekker-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Scale className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-sm font-semibold">Formula basis</p>
                <p className="text-xs text-muted-foreground">Enter the recipe the way production measures it, e.g. 200 L of soap. The system converts it into sellable units using this product’s unit size: <span className="font-mono text-primary">{product.volume || 'set product volume first'}</span>.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Formula produces</Label><Input type="number" min="0" step="any" value={batchOutputQty} onChange={(e) => setBatchOutputQty(e.target.value)} placeholder="200" /></div>
              <div className="space-y-1.5"><Label>Formula unit</Label><Input value={batchOutputUnit} onChange={(e) => setBatchOutputUnit(e.target.value)} placeholder="L" /></div>
              <div className="rounded-lg border border-rekker-border bg-accent/30 px-3 py-2"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Sellable units</p><p className="text-lg font-bold">{Number(outputUnits || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
              <div className="rounded-lg border border-rekker-border bg-accent/30 px-3 py-2"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Unit size</p><p className="text-lg font-bold">{product.volume || '—'}</p></div>
            </div>
            <p className="text-[10px] text-muted-foreground">For materials, fill Qty used in this full formula. Qty/unit is calculated automatically but can still be entered directly for special cases.</p>
          </div>

          {/* Raw materials */}
          <div className="rounded-xl border border-rekker-border p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="flex items-center gap-1"><Beaker className="w-4 h-4" /> Raw materials</Label>
              <Button size="sm" variant="outline" onClick={() => addEntry('raw')}><Plus className="w-3.5 h-3.5" /> Add</Button>
            </div>
            <div className="rounded-lg bg-accent/30 border border-rekker-border px-3 py-2 text-xs text-muted-foreground">
              For each raw material pick it from the dropdown then fill <span className="font-semibold text-foreground">ONE</span> of the two quantity fields:
              <ul className="list-disc ml-4 mt-1 space-y-0.5">
                <li><span className="font-semibold text-foreground">Qty / formula</span> — total amount you weigh into the full batch (e.g. 50 kg of caustic for a 200 L formula). <span className="text-primary">Recommended</span> — matches how the PM actually works.</li>
                <li><span className="font-semibold text-foreground">Qty / unit</span> — exact amount per sellable unit. Only fill this if you cost something per bottle directly (e.g. fragrance dosed per 500ml). Leave Qty/formula at 0 in that case.</li>
              </ul>
              <p className="mt-1">The "≈" column shows the auto-computed per-unit quantity used for costing.</p>
            </div>
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
              <div className="col-span-4">Material</div>
              <div className="col-span-2">Qty / formula</div>
              <div className="col-span-2">Qty / unit</div>
              <div className="col-span-2">Per unit (calc)</div>
              <div className="col-span-1 text-right">Cost/unit</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {entries.map((e, i) => e.kind !== 'packaging' && (
                <BOMRow key={i} e={e} i={i} matMap={matMap} materials={materials.filter(m=>m.category!=='packaging')} batch={outputUnits} updateEntry={updateEntry} removeEntry={removeEntry} entriesLength={entries.length} />
              ))}
            </div>
            <div className="text-right text-xs font-mono text-muted-foreground">Raw materials / unit: <span className="text-primary font-bold ml-2">KES {rawCost.toFixed(2)}</span></div>
          </div>

          {/* Packaging materials */}
          <div className="rounded-xl border border-rekker-border p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="flex items-center gap-1"><Box className="w-4 h-4" /> Packaging materials</Label>
              <Button size="sm" variant="outline" onClick={() => addEntry('packaging')}><Plus className="w-3.5 h-3.5" /> Add</Button>
            </div>
            <p className="text-xs text-muted-foreground">For packaging (bottles, caps, labels, cartons) you almost always fill <span className="font-semibold text-foreground">Qty / unit = 1</span> (one bottle per sellable unit, etc.). Use Qty / formula only for shared packaging consumed across the whole batch.</p>
            <div className="space-y-2">
              {entries.map((e, i) => e.kind === 'packaging' && (
                <BOMRow key={i} e={e} i={i} matMap={matMap} materials={materials.filter(m=>m.category==='packaging')} batch={outputUnits} updateEntry={updateEntry} removeEntry={removeEntry} entriesLength={entries.length} />
              ))}
              {entries.every(e => e.kind !== 'packaging') && <p className="text-xs text-muted-foreground">No packaging materials yet (bottles, caps, labels, cartons…).</p>}
            </div>
            <div className="text-right text-xs font-mono text-muted-foreground">Packaging / unit: <span className="text-primary font-bold ml-2">KES {packCost.toFixed(2)}</span></div>
          </div>

          <div className="rounded-xl border border-rekker-border p-4 space-y-3">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Other per-unit costs (defaults; per-cycle overheads override)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Labor / unit</Label><Input type="number" min="0" step="any" value={labor} onChange={(e) => setLabor(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Extra packaging / unit</Label><Input type="number" min="0" step="any" value={packaging} onChange={(e) => setPackaging(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Overhead / unit</Label><Input type="number" min="0" step="any" value={overhead} onChange={(e) => setOverhead(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>BOM notes (what changed?)</Label><Textarea rows={2} value={bomNotes} onChange={(e) => setBomNotes(e.target.value)} /></div>
          </div>

          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Calculator className="w-3.5 h-3.5" /> Live cost breakdown</p>
                <p className="text-3xl font-bold text-primary">{money(unitCost)} / {product.unitDescription || 'unit'}</p>
              </div>
              <Button onClick={saveBOM} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save as new revision</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <CostTile label="Materials only / unit" value={rawCost} />
              <CostTile label="Materials / litre" value={costPerLitreMaterials} muted={productVolume.litres <= 0} />
              <CostTile label="Packaging / unit" value={packCost + Number(packaging || 0)} />
              <CostTile label="Labor / unit" value={labor} />
              <CostTile label="Overheads / unit" value={overhead} />
            </div>
            <p className="text-xs text-muted-foreground">Formula total: {Number(batchOutputQty || 0).toLocaleString()} {batchOutputUnit || ''} ≈ {Number(outputUnits || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} sellable units. Full cost includes raw materials, packaging materials, extra packaging, labor, and overheads.</p>
          </div>
        </TabsContent>

        <TabsContent value="bomHistory">
          {bomHistory.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No BOM revisions yet.</p> : (
            <ul className="divide-y divide-rekker-border rounded-xl border border-rekker-border">
              {bomHistory.map((b) => (
                <li key={b._id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono">Rev #{b.revision} {b.isActive && <Badge variant="success" className="ml-2">Active</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{b.entries.length} materials · labor {b.laborCostPerUnit} · pkg {b.packagingCostPerUnit} · oh {b.overheadCostPerUnit}{b.notes && <> · {b.notes}</>}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-primary">KES {Number(b.totalUnitCost).toFixed(2)}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{format(new Date(b.createdAt), 'dd/MM/yy HH:mm')}</p>
                  </div>
                  {!b.isActive && <Button size="sm" variant="outline" onClick={() => activateRev(b._id)}><RotateCcw className="w-3.5 h-3.5" /> Restore</Button>}
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

function CostTile({ label, value, muted = false }) {
  return (
    <div className="rounded-lg border border-rekker-border bg-background/70 px-3 py-2 min-w-0">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-tight">{label}</p>
      <p className={`font-mono font-bold mt-1 ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{muted ? '—' : money(value)}</p>
    </div>
  );
}

function BOMRow({ e, i, matMap, materials, batch, updateEntry, removeEntry, entriesLength }) {
  const mat = matMap[e.material];
  const perUnit = (Number(e.qtyPerBatch) > 0 && Number(batch) > 0) ? Number(e.qtyPerBatch) / Number(batch) : Number(e.qtyPerUnit || 0);
  const line = perUnit * Number(mat?.currentUnitPrice || 0);
  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-4">
        <Select value={e.material} onValueChange={(v) => updateEntry(i, { material: v })}>
          <SelectTrigger><SelectValue placeholder="Material…" /></SelectTrigger>
          <SelectContent>{materials.map((m) => <SelectItem key={m._id} value={m._id}>{m.name} ({m.unit}) · {Number(m.currentUnitPrice).toFixed(2)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="col-span-2"><Input type="number" min="0" step="any" value={e.qtyPerBatch} onChange={(ev) => updateEntry(i, { qtyPerBatch: ev.target.value })} placeholder="Qty/formula" /></div>
      <div className="col-span-2"><Input type="number" min="0" step="any" value={e.qtyPerUnit} onChange={(ev) => updateEntry(i, { qtyPerUnit: ev.target.value })} placeholder="Qty/unit" /></div>
      <div className="col-span-2 text-xs font-mono text-muted-foreground">≈ {perUnit.toFixed(4)} {mat?.unit || ''}</div>
      <div className="col-span-1 text-xs font-mono text-primary">KES {line.toFixed(2)}</div>
      <div className="col-span-1 flex justify-end">{entriesLength > 1 && <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => removeEntry(i)}><X className="w-3.5 h-3.5" /></Button>}</div>
    </div>
  );
}
