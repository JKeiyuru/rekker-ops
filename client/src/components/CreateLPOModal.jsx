// client/src/components/CreateLPOModal.jsx

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Package, Layers } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel, SelectGroup,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const NEW_BRANCH_SENTINEL = '__NEW__';

// ── Branch Selector ──────────────────────────────────────────────────────────
// Renders a proper Select dropdown. If user picks "Add new branch…",
// a text input appears beneath it for typing the new name.
function BranchSelector({ value, onChange, branches }) {
  // value = { branchId, branchNameRaw, isNew }
  const [newName, setNewName] = useState('');

  const selectValue = value.isNew ? NEW_BRANCH_SENTINEL : (value.branchId || '');

  const handleSelectChange = (val) => {
    if (val === NEW_BRANCH_SENTINEL) {
      setNewName('');
      onChange({ branchId: null, branchNameRaw: '', isNew: true });
    } else {
      const branch = branches.find((b) => b._id === val);
      onChange({ branchId: val, branchNameRaw: branch?.name || '', isNew: false });
    }
  };

  const handleNewNameChange = (e) => {
    setNewName(e.target.value);
    onChange({ branchId: null, branchNameRaw: e.target.value, isNew: true });
  };

  return (
    <div className="space-y-2">
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select branch…" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Verified Branches</SelectLabel>
            {branches.length === 0 && (
              <SelectItem value="__NONE__" disabled>No branches yet</SelectItem>
            )}
            {branches.map((b) => (
              <SelectItem key={b._id} value={b._id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value={NEW_BRANCH_SENTINEL} className="text-primary font-medium">
            + Add new branch…
          </SelectItem>
        </SelectContent>
      </Select>

      {value.isNew && (
        <div className="space-y-1">
          <Input
            autoFocus
            placeholder="Type new branch name…"
            value={newName}
            onChange={handleNewNameChange}
            className="border-amber-500/50 focus-visible:ring-amber-500/40"
          />
          <p className="text-[11px] text-amber-400 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            Admin will be notified to verify this branch
          </p>
        </div>
      )}
    </div>
  );
}

// ── Batch Row ────────────────────────────────────────────────────────────────
function BatchRow({ index, row, onChange, onRemove, branches }) {
  const updateBranch = (v) => {
    onChange(index, 'branchId', v.branchId);
    onChange(index, 'branchNameRaw', v.branchNameRaw);
    onChange(index, 'isNew', v.isNew);
  };

  return (
    <div className="p-3 rounded-lg border border-border bg-accent/20 space-y-2">
      <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
        <span className="text-xs font-mono text-muted-foreground w-5 text-right">{index + 1}.</span>
        <Input
          placeholder="LPO Number"
          className="font-mono uppercase h-8 text-sm"
          value={row.lpoNumber}
          onChange={(e) => onChange(index, 'lpoNumber', e.target.value)}
        />
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="pl-7">
        <BranchSelector
          value={{ branchId: row.branchId, branchNameRaw: row.branchNameRaw, isNew: row.isNew }}
          onChange={updateBranch}
          branches={branches}
        />
      </div>
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────
const EMPTY_ROW = () => ({ lpoNumber: '', branchId: null, branchNameRaw: '', isNew: false });

export default function CreateLPOModal({ open, onClose, onCreated }) {
  const [persons, setPersons]   = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [mode, setMode]         = useState('single');

  // Shared
  const [date, setDate]               = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [personId, setPersonId]       = useState('');
  const [issueNow, setIssueNow]       = useState(true);

  // Single
  const [singleLpoNumber, setSingleLpoNumber] = useState('');
  const [singleBranch, setSingleBranch]       = useState({ branchId: null, branchNameRaw: '', isNew: false });

  // Batch
  const [batchRows, setBatchRows] = useState([EMPTY_ROW(), EMPTY_ROW()]);

  const reset = useCallback(() => {
    setDate(new Date().toISOString().split('T')[0]);
    setDeliveryDate('');
    setPersonId('');
    setIssueNow(true);
    setSingleLpoNumber('');
    setSingleBranch({ branchId: null, branchNameRaw: '', isNew: false });
    setBatchRows([EMPTY_ROW(), EMPTY_ROW()]);
    setMode('single');
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      api.get('/persons').then((r) => setPersons(r.data));
      api.get('/branches').then((r) => setBranches(r.data));
    }
  }, [open, reset]);

  // If branch is new (free-typed), suggest it to the server first to get an ID
  const resolveBranch = async ({ branchId, branchNameRaw, isNew }) => {
    if (!isNew && branchId) return { branchId, branchNameRaw };
    if (isNew && branchNameRaw?.trim()) {
      const res = await api.post('/branches/suggest', { name: branchNameRaw.trim() });
      return { branchId: res.data._id, branchNameRaw: res.data.name };
    }
    return { branchId: null, branchNameRaw: '' };
  };

  const validateShared = () => {
    if (!personId)     { toast.error('Select a responsible person'); return false; }
    if (!deliveryDate) { toast.error('Set a delivery date');          return false; }
    return true;
  };

  const handleSingleSubmit = async () => {
    if (!singleLpoNumber.trim()) return toast.error('LPO Number is required');
    if (!validateShared()) return;
    setLoading(true);
    try {
      const { branchId, branchNameRaw } = await resolveBranch(singleBranch);
      const res = await api.post('/lpos', {
        lpoNumber: singleLpoNumber,
        date,
        deliveryDate,
        responsiblePerson: personId,
        issuedNow: issueNow,
        branchId,
        branchNameRaw,
      });
      toast.success(`LPO ${res.data.lpoNumber} created!`);
      onCreated([res.data]);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create LPO');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSubmit = async () => {
    const validRows = batchRows.filter((r) => r.lpoNumber.trim());
    if (!validRows.length) return toast.error('Add at least one LPO number');
    if (!validateShared()) return;
    setLoading(true);
    try {
      const resolved = await Promise.all(validRows.map((r) => resolveBranch(r)));
      const lpos = validRows.map((r, i) => ({
        lpoNumber: r.lpoNumber,
        branchId:      resolved[i].branchId,
        branchNameRaw: resolved[i].branchNameRaw,
        deliveryDate,
      }));
      const res = await api.post('/lpos/batch', {
        lpos,
        date,
        deliveryDate,
        responsiblePerson: personId,
        issuedNow: issueNow,
      });
      toast.success(`${res.data.length} LPOs created as a batch!`);
      onCreated(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create batch');
    } finally {
      setLoading(false);
    }
  };

  const addRow    = () => setBatchRows((r) => [...r, EMPTY_ROW()]);
  const removeRow = (i) => setBatchRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i, key, val) =>
    setBatchRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  const validBatchCount = batchRows.filter((r) => r.lpoNumber.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New LPO Entry</DialogTitle>
          <DialogDescription>
            Create a single order or batch multiple LPOs for the same person and date.
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-2 mt-1">
          {[
            { val: 'single', icon: Package, label: 'Single LPO' },
            { val: 'batch',  icon: Layers,  label: 'Batch LPOs' },
          ].map(({ val, icon: Icon, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => setMode(val)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all',
                mode === val
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4 mt-1">
          {/* Shared fields */}
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

          {/* ── Single mode ── */}
          {mode === 'single' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>LPO Number</Label>
                <Input
                  placeholder="e.g. LPO-2024-001"
                  className="font-mono uppercase"
                  value={singleLpoNumber}
                  onChange={(e) => setSingleLpoNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <BranchSelector
                  value={singleBranch}
                  onChange={setSingleBranch}
                  branches={branches}
                />
              </div>
            </div>
          )}

          {/* ── Batch mode ── */}
          {mode === 'batch' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>LPO Entries</Label>
                <p className="text-xs text-muted-foreground font-mono">
                  {validBatchCount} valid {validBatchCount === 1 ? 'entry' : 'entries'}
                </p>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {batchRows.map((row, i) => (
                  <BatchRow
                    key={i}
                    index={i}
                    row={row}
                    onChange={updateRow}
                    onRemove={removeRow}
                    branches={branches}
                  />
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full border-dashed">
                <Plus className="w-3.5 h-3.5" />
                Add Row
              </Button>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                <p className="text-xs text-amber-400 font-mono">
                  💡 All rows share the same person and date. Each LPO can go to a different branch.
                </p>
              </div>
            </div>
          )}

          {/* Issue now */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-accent/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Mark as Issued Now</p>
              <p className="text-xs text-muted-foreground">Timestamps the issue time immediately</p>
            </div>
            <Switch checked={issueNow} onCheckedChange={setIssueNow} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={loading}
              onClick={mode === 'single' ? handleSingleSubmit : handleBatchSubmit}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {mode === 'batch'
                ? `Create ${validBatchCount || ''} LPO${validBatchCount !== 1 ? 's' : ''}`
                : 'Create LPO'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
