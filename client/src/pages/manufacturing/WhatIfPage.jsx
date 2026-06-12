// client/src/pages/manufacturing/WhatIfPage.jsx
// Admin-only. Simulate a material price change and see downstream cost & margin impact.

import { useEffect, useState } from 'react';
import { Lightbulb, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function WhatIfPage() {
  const [materials, setMaterials] = useState([]);
  const [materialId, setMaterialId] = useState('');
  const [newPrice, setNewPrice] = useState(0);
  const [pct, setPct] = useState(10);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/materials').then(r => setMaterials(r.data || [])); }, []);

  const current = materials.find(m => m._id === materialId);
  useEffect(() => { if (current) setNewPrice(Number(current.currentUnitPrice || 0)); }, [materialId]); // eslint-disable-line

  const applyPct = (p) => {
    setPct(p);
    if (current) setNewPrice(Number((Number(current.currentUnitPrice || 0) * (1 + p / 100)).toFixed(4)));
  };

  const run = async () => {
    if (!materialId) return toast.error('Pick a material');
    setLoading(true);
    try {
      const res = await api.post('/mfg/what-if', { materialId, newPrice: Number(newPrice) });
      setResult(res.data);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><Lightbulb className="w-6 h-6 text-primary" /> What-If Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">Simulate a material price change. Nothing is saved — this is for planning.</p>
      </div>

      <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Material</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
              <SelectContent>{materials.map(m => <SelectItem key={m._id} value={m._id}>{m.name} — KES {Number(m.currentUnitPrice||0).toFixed(2)}/{m.unit}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>New price (KES / {current?.unit || 'unit'})</Label>
            <Input type="number" min="0" step="any" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Quick change %</Label>
            <div className="flex gap-1">
              {[-20, -10, 5, 10, 20].map(p => (
                <button key={p} onClick={() => applyPct(p)} className={`flex-1 px-2 py-2 rounded-lg text-xs font-mono border ${pct===p ? 'bg-primary/15 text-primary border-primary/30' : 'border-rekker-border text-muted-foreground hover:text-foreground'}`}>{p>0?'+':''}{p}%</button>
              ))}
            </div>
          </div>
        </div>
        <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Run analysis</Button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
            <p className="text-sm">
              <span className="font-mono">{result.material.name}</span> · current KES {Number(result.material.currentUnitPrice).toFixed(2)} → simulated <span className="font-bold text-primary">KES {Number(result.material.simulatedPrice).toFixed(2)}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">{result.impactedCount} product{result.impactedCount===1?'':'s'} affected.</p>
          </div>
          {result.impacted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products use this material yet.</p>
          ) : (
            <div className="rounded-xl border border-rekker-border overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-rekker-surface"><tr>{['Product','Old cost','New cost','Δ','Δ %','Sell excl','Old margin','New margin'].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {result.impacted.map(p => (
                    <tr key={p.product._id} className="border-t border-rekker-border/50">
                      <td className="px-4 py-2.5 font-medium">{p.product.name}</td>
                      <td className="px-4 py-2.5 font-mono">KES {Number(p.oldUnitCost).toFixed(2)}</td>
                      <td className="px-4 py-2.5 font-mono text-primary">KES {Number(p.newUnitCost).toFixed(2)}</td>
                      <td className={`px-4 py-2.5 font-mono ${p.deltaCost>0?'text-red-500':p.deltaCost<0?'text-emerald-500':''}`}>{p.deltaCost>0?'+':''}{Number(p.deltaCost).toFixed(2)}</td>
                      <td className={`px-4 py-2.5 font-mono ${(p.deltaPct||0)>0?'text-red-500':(p.deltaPct||0)<0?'text-emerald-500':''}`}>
                        {p.deltaPct != null && <span className="inline-flex items-center gap-1">{p.deltaPct>0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{Number(p.deltaPct).toFixed(1)}%</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono">{p.sellExcl ? `KES ${Number(p.sellExcl).toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2.5 font-mono">{p.oldMarginPct != null ? `${Number(p.oldMarginPct).toFixed(1)}%` : '—'}</td>
                      <td className={`px-4 py-2.5 font-mono ${p.newMarginPct < 0 ? 'text-red-500' : ''}`}>{p.newMarginPct != null ? `${Number(p.newMarginPct).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
