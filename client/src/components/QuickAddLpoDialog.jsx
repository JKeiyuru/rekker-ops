// client/src/components/QuickAddLpoDialog.jsx
//
// Lets the user create an LPO without leaving the invoice workflow.
// If they search for an LPO number in the invoice dialog and it isn't in the
// system yet, they open this, fill the few required fields, and the new LPO is
// immediately available (and auto-selected) for the invoice being created.

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, FilePlus2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const NEW_BRANCH = '__NEW__';
const today = () => new Date().toISOString().split('T')[0];

export default function QuickAddLpoDialog({
  open, onOpenChange, defaultLpoNumber = '', onCreated,
}) {
  const [persons, setPersons]   = useState([]);
  const [branches, setBranches] = useState([]);
  const [refLoading, setRefLoading] = useState(false);
  const [saving, setSaving]     = useState(false);

  const [lpoNumber, setLpoNumber]       = useState('');
  const [branchId, setBranchId]         = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [personId, setPersonId]         = useState('');
  const [date, setDate]                 = useState(today);
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [amount, setAmount]             = useState('');

  const load = useCallback(async () => {
    setRefLoading(true);
    try {
      const [p, b] = await Promise.all([api.get('/persons'), api.get('/branches')]);
      setPersons(Array.isArray(p.data) ? p.data : []);
      setBranches(Array.isArray(b.data) ? b.data : []);
    } catch {
      toast.error('Could not load branches / people');
    } finally { setRefLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLpoNumber(defaultLpoNumber || '');
    setBranchId(''); setNewBranchName(''); setPersonId('');
    setDate(today()); setDeliveryDate(today()); setAmount('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!lpoNumber.trim()) return toast.error('LPO number required');
    if (!personId)         return toast.error('Select the responsible person');
    if (!deliveryDate)     return toast.error('Set a delivery date');
    setSaving(true);
    try {
      let resolvedBranchId = branchId === NEW_BRANCH ? null : (branchId || null);
      let branchNameRaw = branches.find((b) => b._id === resolvedBranchId)?.name || '';
      if (branchId === NEW_BRANCH) {
        if (!newBranchName.trim()) { setSaving(false); return toast.error('Type the new branch name'); }
        const res = await api.post('/branches/suggest', { name: newBranchName.trim() });
        resolvedBranchId = res.data._id;
        branchNameRaw = res.data.name;
      }
      const res = await api.post('/lpos', {
        lpoNumber: lpoNumber.trim(),
        date, deliveryDate,
        responsiblePerson: personId,
        issuedNow: true,
        branchId: resolvedBranchId,
        branchNameRaw,
        amount: amount !== '' ? Number(amount) : null,
      });
      toast.success(`LPO ${res.data.lpoNumber} added`);
      onCreated?.(res.data);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create LPO');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="w-4 h-4 text-primary" /> Add LPO
          </DialogTitle>
          <DialogDescription>
            This LPO isn&apos;t in the system yet — capture it here and it will be selected
            for the invoice you&apos;re creating.
          </DialogDescription>
        </DialogHeader>

        {refLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>LPO Number</Label>
                <Input className="font-mono uppercase" placeholder="e.g. LPO-1234"
                  value={lpoNumber} onChange={(e) => setLpoNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>LPO Value <span className="text-muted-foreground font-normal normal-case">(ex. VAT)</span></Label>
                <Input type="number" min="0" step="0.01" className="font-mono" placeholder="0.00"
                  value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="Select branch…" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Verified Branches</SelectLabel>
                    {branches.length === 0 && <SelectItem value="__NONE__" disabled>No branches yet</SelectItem>}
                    {branches.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectItem value={NEW_BRANCH} className="text-primary font-medium">+ Add new branch…</SelectItem>
                </SelectContent>
              </Select>
              {branchId === NEW_BRANCH && (
                <Input autoFocus placeholder="Type new branch name…"
                  className="border-amber-500/50 focus-visible:ring-amber-500/40"
                  value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Responsible Person</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger><SelectValue placeholder="Select person…" /></SelectTrigger>
                <SelectContent>
                  {persons.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>LPO Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Delivery Date</Label>
                <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving || refLoading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add LPO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
