// client/src/components/EditLPOModal.jsx
// Full edit modal for LPO — packaging_team_lead and above.
// Editable: LPO#, branch, customer text, amount, date, delivery date,
// responsible person, notes. Changes cascade to linked invoices.

import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function EditLPOModal({ open, onClose, lpo, onUpdated }) {
  const [persons, setPersons]   = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [f, setF] = useState({
    lpoNumber: '', branchId: '', branchNameRaw: '', customer: '',
    amount: '', personId: '', date: '', deliveryDate: '', notes: '',
  });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (open && lpo) {
      setF({
        lpoNumber:    lpo.lpoNumber || '',
        branchId:     lpo.branch?._id || '',
        branchNameRaw: lpo.branchNameRaw || '',
        customer:     lpo.customer || '',
        amount:       lpo.amount != null ? String(lpo.amount) : '',
        personId:     lpo.responsiblePerson?._id || lpo.responsiblePerson || '',
        date:         lpo.date ? new Date(lpo.date).toISOString().split('T')[0] : '',
        deliveryDate: lpo.deliveryDate ? new Date(lpo.deliveryDate).toISOString().split('T')[0] : '',
        notes:        lpo.notes || '',
      });
      Promise.all([api.get('/persons'), api.get('/branches')])
        .then(([p, b]) => { setPersons(p.data || []); setBranches(b.data || []); })
        .catch(() => {});
    }
  }, [open, lpo]);

  const handleSave = async () => {
    if (!f.lpoNumber.trim()) return toast.error('LPO Number required');
    setLoading(true);
    try {
      const res = await api.put(`/lpos/${lpo._id}`, {
        lpoNumber:         f.lpoNumber.toUpperCase(),
        branchId:          f.branchId || null,
        branchNameRaw:     f.branchNameRaw,
        customer:          f.customer,
        amount:            f.amount !== '' ? Number(f.amount) : null,
        responsiblePerson: f.personId || undefined,
        date:              f.date || undefined,
        deliveryDate:      f.deliveryDate || undefined,
        notes:             f.notes,
      });
      onUpdated(res.data);
      toast.success('LPO updated — linked invoices recalculated');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  if (!lpo) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit LPO</DialogTitle>
          <DialogDescription>
            Changes cascade to every invoice linked to this LPO. Amount changes recompute disparity automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>LPO Number</Label>
              <Input className="font-mono uppercase" value={f.lpoNumber}
                onChange={(e) => set('lpoNumber')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (KES)</Label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
                <Input type="number" min="0" step="0.01" placeholder="0.00"
                  className="pl-10 font-mono" value={f.amount}
                  onChange={(e) => set('amount')(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Select value={f.branchId || '__none__'} onValueChange={(v) => set('branchId')(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select branch…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No branch —</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Customer <span className="text-muted-foreground font-normal normal-case">(free text)</span></Label>
            <Input placeholder="e.g. Naivas Kilimani" value={f.customer}
              onChange={(e) => set('customer')(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Delivery Date</Label>
              <Input type="date" value={f.deliveryDate}
                onChange={(e) => set('deliveryDate')(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsible Person</Label>
            <Select value={f.personId} onValueChange={set('personId')}>
              <SelectTrigger><SelectValue placeholder="Select person…" /></SelectTrigger>
              <SelectContent>
                {persons.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={f.notes} onChange={(e) => set('notes')(e.target.value)} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
