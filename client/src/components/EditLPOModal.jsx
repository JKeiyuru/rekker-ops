// client/src/components/EditLPOModal.jsx
// Allows editing LPO number, amount, and assigned person.
// Admin and above only.

import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function EditLPOModal({ open, onClose, lpo, onUpdated }) {
  const [persons, setPersons]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [lpoNumber, setLpoNumber]   = useState('');
  const [amount, setAmount]         = useState('');
  const [personId, setPersonId]     = useState('');

  useEffect(() => {
    if (open && lpo) {
      setLpoNumber(lpo.lpoNumber || '');
      setAmount(lpo.amount != null ? String(lpo.amount) : '');
      setPersonId(lpo.responsiblePerson?._id || lpo.responsiblePerson || '');
      api.get('/persons').then((r) => setPersons(r.data));
    }
  }, [open, lpo]);

  const handleSave = async () => {
    if (!lpoNumber.trim()) return toast.error('LPO Number required');
    setLoading(true);
    try {
      const res = await api.put(`/lpos/${lpo._id}`, {
        lpoNumber:         lpoNumber.toUpperCase(),
        amount:            amount !== '' ? Number(amount) : null,
        responsiblePerson: personId || lpo.responsiblePerson?._id,
      });
      onUpdated(res.data);
      toast.success('LPO updated');
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit LPO</DialogTitle>
          <DialogDescription>Update the LPO number, amount, or assigned person.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>LPO Number</Label>
            <Input
              className="font-mono uppercase"
              value={lpoNumber}
              onChange={(e) => setLpoNumber(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Amount (KES)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsible Person</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger>
                <SelectValue placeholder="Select person…" />
              </SelectTrigger>
              <SelectContent>
                {persons.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
