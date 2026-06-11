// client/src/pages/manufacturing/ProductionCyclesPage.jsx
// FIXED: Dynamic import of jsPDF-based exportProductionCyclePDF to prevent
// "r is not a function" bundle-initialisation race on first page load.

import { useEffect, useState } from 'react';
import { Plus, BarChart3, CheckCircle2, Loader2, Download } from 'lucide-react';
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

// Dynamic import: jsPDF and jspdf-autotable have side-effects that can cause
// "r is not a function" if their module-level code runs before React's chunk
// is fully initialised. Lazy-loading them on demand avoids the race entirely.
async function exportPDF(cycle) {
  try {
    const { exportProductionCyclePDF } = await import('@/lib/pdf');
    exportProductionCyclePDF(cycle);
  } catch (err) {
    console.error('PDF export failed:', err);
    toast.error('PDF export failed. Please try again.');
  }
}

function StartCycleModal({ open, onClose, products, onStarted }) {
  const [product, setProduct] = useState('');
  const [units, setUnits] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setProduct(''); setUnits(0); setNotes(''); }
  }, [open]);

  const save = async () => {
    if (!product) return toast.error('Pick a product');
    setLoading(true);
    try {
      const res = await api.post('/production-cycles', {
        product,
        unitsProduced: Number(units) || 0,
        notes,
      });
      onStarted(res.data);
      toast.success('Cycle started');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start Production Cycle</DialogTitle>
          <DialogDescription>
            Snapshots the current BOM so cost-per-unit is locked at start.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}{p.volume ? ` · ${p.volume}` : ''} — KES {Number(p.currentUnitCost || 0).toFixed(2)}/unit
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Units produced (estimate, editable later)</Label>
            <Input type="number" min="0" value={units} onChange={(e) => setUnits(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={save} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Start
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductionCyclesPage() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [exportingId, setExportingId] = useState(null);

  const load = () =>
    Promise.all([api.get('/production-cycles'), api.get('/products')])
      .then(([c, p]) => { setList(c.data || []); setProducts(p.data || []); });

  useEffect(() => { load(); }, []);

  const endCycle = async (c) => {
    const units = window.prompt('Final units produced?', c.unitsProduced || 0);
    if (units == null) return;
    try {
      const res = await api.post(`/production-cycles/${c._id}/end`, {
        unitsProduced: Number(units),
      });
      setList((p) => p.map((x) => (x._id === c._id ? res.data : x)));
      toast.success('Cycle ended');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const handleExportPDF = async (cycle) => {
    setExportingId(cycle._id);
    await exportPDF(cycle);
    setExportingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Production Cycles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each cycle locks the BOM snapshot at start.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> Start Cycle
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <p className="text-sm text-muted-foreground">No cycles yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-rekker-surface">
              <tr>
                {['Cycle', 'Product', 'Units', 'Cost/unit', 'Total cost', 'Status', 'Started', 'Ended', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                  <td className="px-4 py-2.5 font-mono text-primary">{c.cycleNumber}</td>
                  <td className="px-4 py-2.5">{c.product?.name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono">{c.unitsProduced}</td>
                  <td className="px-4 py-2.5 font-mono">
                    KES {Number(c.costPerUnit || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-primary">
                    KES {Number(c.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={c.status === 'running' ? 'warning' : 'default'}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                    {format(new Date(c.startedAt), 'dd/MM HH:mm')}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                    {c.endedAt ? format(new Date(c.endedAt), 'dd/MM HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      {c.status === 'running' && (
                        <Button size="sm" variant="outline" onClick={() => endCycle(c)}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> End
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExportPDF(c)}
                        disabled={exportingId === c._id}
                        title="Download PDF"
                      >
                        {exportingId === c._id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />}
                        PDF
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StartCycleModal
        open={open}
        onClose={() => setOpen(false)}
        products={products}
        onStarted={(c) => setList((p) => [c, ...p])}
      />
    </div>
  );
}
