// client/src/pages/fresh/FreshReasonCodesPage.jsx
import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import api from '@/lib/api';

export default function FreshReasonCodesPage() {
  const [list, setList] = useState([]);
  const [nc, setNc] = useState({ code: '', label: '', order: 100 });
  const load = async () => setList((await api.get('/fresh/reason-codes')).data);
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!nc.code || !nc.label) return toast.error('Code and label required');
    try { await api.post('/fresh/reason-codes', nc); setNc({ code: '', label: '', order: 100 }); toast.success('Added'); load(); }
    catch (e) { toast.error(e.response?.data?.message); }
  };
  const update = async (id, body) => {
    try { await api.patch(`/fresh/reason-codes/${id}`, body); toast.success('Saved'); load(); }
    catch (e) { toast.error(e.response?.data?.message); }
  };
  const retire = async (id) => {
    if (!confirm('Retire this reason?')) return;
    try { await api.delete(`/fresh/reason-codes/${id}`); load(); } catch (e) { toast.error(e.response?.data?.message); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display tracking-widest">REASON CODES</h1>
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">
          Fresh module — add, edit, or retire codes without redeploying
        </p>
      </div>

      <div className="rounded-xl border border-rekker-border p-4 flex items-end gap-2">
        <div className="flex-1"><label className="text-xs text-muted-foreground">Code</label>
          <Input value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value.toUpperCase() })} placeholder="EG_LATE_DELIVERY" /></div>
        <div className="flex-1"><label className="text-xs text-muted-foreground">Label</label>
          <Input value={nc.label} onChange={(e) => setNc({ ...nc, label: e.target.value })} placeholder="Late delivery" /></div>
        <div className="w-20"><label className="text-xs text-muted-foreground">Order</label>
          <Input type="number" value={nc.order} onChange={(e) => setNc({ ...nc, order: Number(e.target.value) })} /></div>
        <Button onClick={add}><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>

      <div className="rounded-xl border border-rekker-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-rekker-surface border-b border-rekker-border">
            <tr>{['Code','Label','Order','Active',''].map((h) => <th key={h} className="text-left px-3 py-2 text-[10px] font-mono uppercase text-muted-foreground">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <RowEdit key={r._id} r={r} onSave={update} onRetire={retire} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowEdit({ r, onSave, onRetire }) {
  const [label, setLabel] = useState(r.label);
  const [order, setOrder] = useState(r.order);
  const [active, setActive] = useState(r.active);
  const dirty = label !== r.label || order !== r.order || active !== r.active;
  return (
    <tr className="border-b border-rekker-border/50">
      <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
      <td className="px-3 py-2"><Input className="h-8" value={label} onChange={(e) => setLabel(e.target.value)} /></td>
      <td className="px-3 py-2"><Input className="h-8 w-20" type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></td>
      <td className="px-3 py-2"><Switch checked={active} onCheckedChange={setActive} /></td>
      <td className="px-3 py-2 text-right space-x-1">
        <Button size="sm" variant="outline" disabled={!dirty} onClick={() => onSave(r._id, { label, order, active })}>
          <Save className="w-3 h-3 mr-1" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onRetire(r._id)}><Trash2 className="w-3 h-3" /></Button>
      </td>
    </tr>
  );
}
