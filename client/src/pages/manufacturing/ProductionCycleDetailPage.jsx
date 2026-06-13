// client/src/pages/manufacturing/ProductionCycleDetailPage.jsx
// Working surface for an active or completed cycle: actuals, overheads, QC, finalize.

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, CheckCircle2, XCircle, Plus, X, BarChart3, Download, Beaker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { exportProductionCyclePDF } from '@/lib/pdf';

const OVERHEAD_TYPES = ['labor','water','electricity','transport','fuel','maintenance','other'];
const money = (v) => `KES ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProductionCycleDetailPage() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actuals, setActuals] = useState({});       // index -> qty
  const [overheads, setOverheads] = useState([]);   // [{type,label,amount}]
  const [qcChecks, setQc] = useState([]);           // [{test,result,passed,notes}]
  const [units, setUnits] = useState(0);
  const [notes, setNotes] = useState('');

  const load = () => api.get(`/production-cycles/${id}`).then(r => {
    setC(r.data);
    setUnits(r.data.unitsProduced || r.data.expectedUnits || 0);
    setNotes(r.data.notes || '');
    setOverheads(r.data.overheads || []);
    setQc(r.data.qcChecks || []);
    const a = {};
    (r.data.bomSnapshot?.entries || []).forEach((e, i) => { a[i] = e.qtyActual ?? e.qtyConsumed; });
    setActuals(a);
  });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!c) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const isLocked = c.status !== 'running';
  const snapshotActuals = Object.entries(actuals).map(([index, qtyActual]) => ({ index: Number(index), qtyActual: Number(qtyActual) || 0 }));

  const persist = async (action) => {
    setSaving(true);
    try {
      const body = { unitsProduced: Number(units), notes, overheads, qcChecks, snapshotActuals };
      const res = action === 'end'
        ? await api.post(`/production-cycles/${id}/end`, body)
        : await api.put(`/production-cycles/${id}`, body);
      setC(res.data); toast.success(action === 'end' ? 'Cycle completed' : 'Saved');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  const cancel = async () => {
    if (!window.confirm('Cancel this cycle? Materials will be returned to stock.')) return;
    try { const res = await api.post(`/production-cycles/${id}/cancel`); setC(res.data); toast.success('Cancelled'); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const addOh = () => setOverheads(p => [...p, { type: 'other', label: '', amount: 0 }]);
  const updOh = (i, patch) => setOverheads(p => p.map((o, idx) => idx === i ? { ...o, ...patch } : o));
  const rmOh = (i) => setOverheads(p => p.filter((_, idx) => idx !== i));

  const addQc = () => setQc(p => [...p, { test: '', result: '', passed: true, notes: '' }]);
  const updQc = (i, patch) => setQc(p => p.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const rmQc = (i) => setQc(p => p.filter((_, idx) => idx !== i));

  // Live cost preview
  const u = Number(units || 0);
  let raw = 0, pack = 0;
  (c.bomSnapshot?.entries || []).forEach((e, i) => {
    const qty = Number(actuals[i] ?? e.qtyConsumed ?? 0);
    const lt = qty * Number(e.unitPrice || 0);
    if (e.kind === 'packaging') pack += lt; else raw += lt;
  });
  const ohTotal = overheads.reduce((s, o) => s + Number(o.amount || 0), 0);
  const bomLabor = u * Number(c.bomSnapshot?.laborCostPerUnit||0);
  const bomExtraPackaging = u * Number(c.bomSnapshot?.packagingCostPerUnit||0);
  const bomOverhead = u * Number(c.bomSnapshot?.overheadCostPerUnit||0);
  const bomExtra = bomLabor + bomExtraPackaging + bomOverhead;
  const totalLive = raw + pack + bomExtra + ohTotal;
  const perUnit = u > 0 ? totalLive / u : 0;
  const rawPerUnit = u > 0 ? raw / u : 0;
  const packagingPerUnit = u > 0 ? (pack + bomExtraPackaging) / u : 0;
  const laborPerUnit = u > 0 ? bomLabor / u : 0;
  const overheadPerUnit = u > 0 ? (bomOverhead + ohTotal) / u : 0;
  const litresProduced = c.targetOutputLitres && c.expectedUnits ? (Number(c.targetOutputLitres) / Number(c.expectedUnits)) * u : 0;
  const costPerLitre = litresProduced > 0 ? totalLive / litresProduced : 0;

  return (
    <div className="space-y-6">
      <Link to="/manufacturing/cycles" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> All cycles</Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> {c.cycleNumber}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {c.product?.name} · Batch <span className="font-mono text-primary">{c.batchNumber}</span> · BOM rev {c.bomRevision || '—'} · <Badge variant={c.status==='running'?'warning':c.status==='cancelled'?'destructive':'success'}>{c.status}</Badge>
          </p>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">Started {format(new Date(c.startedAt), 'dd MMM yyyy HH:mm')} {c.endedAt && `· Ended ${format(new Date(c.endedAt), 'dd MMM yyyy HH:mm')}`}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportProductionCyclePDF(c)}><Download className="w-3.5 h-3.5" /> PDF</Button>
          {c.status === 'running' && <Button size="sm" variant="outline" className="hover:text-destructive" onClick={cancel}><XCircle className="w-3.5 h-3.5" /> Cancel</Button>}
        </div>
      </div>

      {/* Materials & actuals */}
      <div className="rounded-xl border border-rekker-border p-4 space-y-3">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Beaker className="w-3.5 h-3.5" /> Actual material usage</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"><th className="text-left py-1">Material</th><th className="text-right">Per unit</th><th className="text-right">Planned</th><th className="text-right">Actual used</th><th className="text-right">Unit price</th><th className="text-right">Line cost</th></tr></thead>
            <tbody>
              {(c.bomSnapshot?.entries || []).map((e, i) => {
                const qty = Number(actuals[i] ?? e.qtyConsumed ?? 0);
                const lt = qty * Number(e.unitPrice || 0);
                return (
                  <tr key={i} className="border-t border-rekker-border/40">
                    <td className="py-1.5">{e.materialName} {e.kind==='packaging' && <Badge variant="secondary" className="ml-1">pkg</Badge>}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{Number(e.qtyPerUnit||0)} {e.unit}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{Number(e.qtyConsumed||0).toFixed(2)} {e.unit}</td>
                    <td className="py-1.5 text-right"><Input type="number" min="0" step="any" disabled={isLocked} value={actuals[i] ?? ''} onChange={(ev) => setActuals(p => ({ ...p, [i]: ev.target.value }))} className="w-24 ml-auto" /></td>
                    <td className="py-1.5 text-right font-mono text-xs">KES {Number(e.unitPrice||0).toFixed(2)}</td>
                    <td className="py-1.5 text-right font-mono text-primary">KES {lt.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overheads */}
      <div className="rounded-xl border border-rekker-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Overheads for this cycle</p>
          {!isLocked && <Button size="sm" variant="outline" onClick={addOh}><Plus className="w-3.5 h-3.5" /> Add</Button>}
        </div>
        {overheads.length === 0 ? <p className="text-xs text-muted-foreground">No additional overheads yet (labor, water, electricity, fuel…).</p> : overheads.map((o, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-3">
              <Select value={o.type} onValueChange={(v) => updOh(i, { type: v })} disabled={isLocked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OVERHEAD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-5"><Input placeholder="Description (optional)" value={o.label} disabled={isLocked} onChange={(e) => updOh(i, { label: e.target.value })} /></div>
            <div className="col-span-3"><Input type="number" min="0" step="any" placeholder="KES" value={o.amount} disabled={isLocked} onChange={(e) => updOh(i, { amount: e.target.value })} /></div>
            <div className="col-span-1 flex justify-end">{!isLocked && <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => rmOh(i)}><X className="w-3.5 h-3.5" /></Button>}</div>
          </div>
        ))}
      </div>

      {/* QC */}
      <div className="rounded-xl border border-rekker-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Quality control checks</p>
          {!isLocked && <Button size="sm" variant="outline" onClick={addQc}><Plus className="w-3.5 h-3.5" /> Add check</Button>}
        </div>
        {qcChecks.length === 0 ? <p className="text-xs text-muted-foreground">No QC checks recorded. Suggested: viscosity, pH, color, smell, packaging.</p> : qcChecks.map((q, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-3"><Input placeholder="Test (e.g. pH)" value={q.test} disabled={isLocked} onChange={(e) => updQc(i, { test: e.target.value })} /></div>
            <div className="col-span-3"><Input placeholder="Result" value={q.result} disabled={isLocked} onChange={(e) => updQc(i, { result: e.target.value })} /></div>
            <div className="col-span-2"><Select value={q.passed ? 'pass' : 'fail'} onValueChange={(v) => updQc(i, { passed: v === 'pass' })} disabled={isLocked}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem></SelectContent></Select></div>
            <div className="col-span-3"><Input placeholder="Notes" value={q.notes} disabled={isLocked} onChange={(e) => updQc(i, { notes: e.target.value })} /></div>
            <div className="col-span-1 flex justify-end">{!isLocked && <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => rmQc(i)}><X className="w-3.5 h-3.5" /></Button>}</div>
          </div>
        ))}
      </div>

      {/* Outputs & finalize */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5"><Label>Units produced</Label><Input type="number" min="0" disabled={isLocked} value={units} onChange={(e) => setUnits(e.target.value)} /></div>
          <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Expected</p><p className="text-xl font-bold">{c.expectedUnits}</p></div>
          <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Yield loss</p><p className={`text-xl font-bold ${(c.expectedUnits - Number(units||0)) > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{Math.max(0, c.expectedUnits - Number(units||0))} ({c.expectedUnits>0 ? Math.max(0,(c.expectedUnits - Number(units||0))/c.expectedUnits*100).toFixed(1) : 0}%)</p></div>
          <div><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Cost / unit (live)</p><p className="text-xl font-bold text-primary">KES {perUnit.toFixed(2)}</p></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <CostTile label="Materials / unit" value={rawPerUnit} />
          <CostTile label="Packaging / unit" value={packagingPerUnit} />
          <CostTile label="Labor / unit" value={laborPerUnit} />
          <CostTile label="Overheads / unit" value={overheadPerUnit} />
          <CostTile label="Cost / litre" value={costPerLitre} muted={!litresProduced} />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm">Total cost: <span className="font-mono font-bold text-primary">{money(totalLive)}</span> <span className="text-xs text-muted-foreground">(raw {money(raw)} + packaging {money(pack + bomExtraPackaging)} + labor {money(bomLabor)} + overheads {money(bomOverhead + ohTotal)})</span></p>
          {!isLocked && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => persist('save')} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</Button>
              <Button onClick={() => persist('end')} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Complete cycle</Button>
            </div>
          )}
        </div>
        <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} disabled={isLocked} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
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
