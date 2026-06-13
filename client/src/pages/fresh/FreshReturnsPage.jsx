// client/src/pages/fresh/FreshReturnsPage.jsx

import { useEffect, useState } from 'react';
import { Plus, RotateCcw, Trash2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const REASONS = [
  { v: 'damaged', l: 'Damaged' },
  { v: 'wrong_item', l: 'Wrong item' },
  { v: 'wrong_quantity', l: 'Wrong quantity' },
  { v: 'expired', l: 'Expired' },
  { v: 'short_dated', l: 'Short-dated' },
  { v: 'refused', l: 'Refused' },
  { v: 'other', l: 'Other' },
];

function ReturnModal({ open, onClose, onSaved }) {
  const [lpoCandidates, setLpoCandidates] = useState([]);
  const [selectedLpoIds, setSelectedLpoIds] = useState([]);
  const [lpoDocs, setLpoDocs] = useState({}); // id -> full lpo with items
  const [picked, setPicked] = useState({});   // itemId -> qty
  const [reason, setReason] = useState('damaged');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedLpoIds([]); setLpoDocs({}); setPicked({}); setReason('damaged'); setNotes('');
    api.get('/fresh-customer-lpos', { params: { status: '' } })
      .then((r) => {
        // Only LPOs with items that still have qty remaining
        const list = (r.data || []).filter((l) =>
          (l.items || []).some((it) => Number(it.quantity || 0) - Number(it.returnedQty || 0) > 0)
        );
        setLpoCandidates(list);
      });
  }, [open]);

  const toggleLpo = async (id) => {
    if (selectedLpoIds.includes(id)) {
      setSelectedLpoIds((p) => p.filter((x) => x !== id));
      // remove its items from picked
      const items = lpoDocs[id]?.items || [];
      setPicked((p) => { const c = { ...p }; items.forEach((it) => delete c[it._id]); return c; });
    } else {
      const res = await api.get(`/fresh-customer-lpos/${id}`);
      setLpoDocs((p) => ({ ...p, [id]: res.data }));
      setSelectedLpoIds((p) => [...p, id]);
    }
  };

  const save = async () => {
    const items = [];
    for (const lpoId of selectedLpoIds) {
      const doc = lpoDocs[lpoId];
      for (const it of doc.items) {
        const qty = Number(picked[it._id] || 0);
        if (qty > 0) items.push({ lpo: lpoId, itemId: it._id, qty });
      }
    }
    if (!items.length) return toast.error('Pick at least one item to return');
    setLoading(true);
    try {
      const res = await api.post('/fresh-returns', { reason, notes, items });
      onSaved(res.data);
      toast.success('Return logged');
      onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Return</DialogTitle>
          <DialogDescription>Pick the LPO(s), then enter per-item quantities returned.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REASONS.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>LPOs ({selectedLpoIds.length} selected)</Label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-accent/20 max-h-40 overflow-auto">
              {lpoCandidates.length === 0 && <p className="text-xs text-muted-foreground">No LPOs with returnable items.</p>}
              {lpoCandidates.map((l) => {
                const sel = selectedLpoIds.includes(l._id);
                return (
                  <button key={l._id} type="button" onClick={() => toggleLpo(l._id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-mono border ${sel ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground'}`}>
                    {l.lpoNumber} · {l.customer?.name || l.customerNameRaw || '—'}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedLpoIds.map((id) => {
            const doc = lpoDocs[id];
            if (!doc) return null;
            return (
              <div key={id} className="rounded-xl border border-rekker-border p-3 space-y-2">
                <p className="text-xs font-mono text-muted-foreground">{doc.lpoNumber}</p>
                <div className="space-y-1.5">
                  {doc.items.map((it) => {
                    const remaining = Number(it.quantity || 0) - Number(it.returnedQty || 0);
                    return (
                      <div key={it._id} className="grid grid-cols-12 gap-2 items-center text-xs">
                        <div className="col-span-5">{it.name} <span className="text-muted-foreground">({it.unit})</span></div>
                        <div className="col-span-3 text-muted-foreground font-mono">Remaining: {remaining}</div>
                        <div className="col-span-2 text-muted-foreground font-mono">@ {Number(it.unitPrice).toLocaleString()}</div>
                        <div className="col-span-2">
                          <Input type="number" min="0" max={remaining} step="any"
                            value={picked[it._id] || ''}
                            onChange={(e) => setPicked((p) => ({ ...p, [it._id]: e.target.value }))}
                            placeholder="Qty back" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional…" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={save} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Log Return
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FreshReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/fresh-returns')
      .then((r) => setReturns(r.data || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSaved = (created) => setReturns((p) => [created, ...p]);

  const remove = async (r) => {
    if (!window.confirm(`Delete return ${r.returnNumber}? Items will be added back to the LPO.`)) return;
    try {
      await api.delete(`/fresh-returns/${r._id}`);
      setReturns((p) => p.filter((x) => x._id !== r._id));
      toast.success('Return deleted');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><RotateCcw className="w-6 h-6 text-primary" /> Returns</h1>
          <p className="text-sm text-muted-foreground mt-1">Log items returned by customers against one or many LPOs.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Log Return</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-rekker-surface animate-pulse" />)}</div>
      ) : returns.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <p className="text-sm text-muted-foreground">No returns yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-rekker-surface">
              <tr>
                {['Return #','Date','Reason','LPOs','Items','Value',''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r._id} className="border-t border-rekker-border/50 hover:bg-accent/20">
                  <td className="px-4 py-2.5 font-mono text-primary">{r.returnNumber}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{format(new Date(r.date), 'dd/MM/yy')}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline">{r.reason.replace('_',' ')}</Badge></td>
                  <td className="px-4 py-2.5 text-xs font-mono">{(r.lpos || []).map((l) => l.lpoNumber).join(', ')}</td>
                  <td className="px-4 py-2.5">{r.items?.length || 0}</td>
                  <td className="px-4 py-2.5 font-mono">KES {Number(r.totalValue||0).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => remove(r)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReturnModal open={open} onClose={() => setOpen(false)} onSaved={handleSaved} />
    </div>
  );
}
