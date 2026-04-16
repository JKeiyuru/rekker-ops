// client/src/components/CreateLPOModal.jsx

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Package, Layers, AlertCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// ── Branch Combobox ─────────────────────────────────────────────────────────
function BranchCombobox({ value, onChange, branches }) {
  const [inputVal, setInputVal] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCustom, setIsCustom] = useState(false);

  // Sync display value when parent resets
  useEffect(() => {
    if (!value.branchId && !value.branchNameRaw) {
      setInputVal('');
      setIsCustom(false);
    }
  }, [value]);

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(inputVal.toLowerCase())
  );

  const handleSelect = (branch) => {
    setInputVal(branch.name);
    setIsCustom(false);
    setShowDropdown(false);
    onChange({ branchId: branch._id, branchNameRaw: branch.name });
  };

  const handleInput = (e) => {
    const v = e.target.value;
    setInputVal(v);
    setShowDropdown(true);
    // Check if it matches a known branch
    const match = branches.find((b) => b.name.toLowerCase() === v.toLowerCase());
    if (match) {
      setIsCustom(false);
      onChange({ branchId: match._id, branchNameRaw: match.name });
    } else {
      setIsCustom(v.trim().length > 0);
      onChange({ branchId: null, branchNameRaw: v });
    }
  };

  return (
    <div className="relative">
      <Input
        placeholder="Select or type branch name…"
        value={inputVal}
        onChange={handleInput}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        className={cn(isCustom && 'border-amber-500/60 focus-visible:ring-amber-500/40')}
      />
      {isCustom && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-400">New branch — admin will be notified to verify</p>
        </div>
      )}
      {showDropdown && inputVal && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          {filtered.slice(0, 8).map((b) => (
            <button
              key={b._id}
              type="button"
              onMouseDown={() => handleSelect(b)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single LPO Row (used in batch mode) ─────────────────────────────────────
function BatchRow({ index, row, onChange, onRemove, branches, sharedDeliveryDate }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start p-3 rounded-lg border border-border bg-accent/20">
      <div className="space-y-1">
        <Label className="text-[10px]">LPO Number</Label>
        <Input
          placeholder="LPO-001"
          className="font-mono uppercase h-8 text-sm"
          value={row.lpoNumber}
          onChange={(e) => onChange(index, 'lpoNumber', e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Branch</Label>
        <BranchCombobox
          value={{ branchId: row.branchId, branchNameRaw: row.branchNameRaw }}
          onChange={(v) => { onChange(index, 'branchId', v.branchId); onChange(index, 'branchNameRaw', v.branchNameRaw); }}
          branches={branches}
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mt-6 p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────
const EMPTY_ROW = () => ({ lpoNumber: '', branchId: null, branchNameRaw: '' });

export default function CreateLPOModal({ open, onClose, onCreated }) {
  const [persons, setPersons]   = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [mode, setMode]         = useState('single'); // 'single' | 'batch'

  // Shared fields
  const [date, setDate]               = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [personId, setPersonId]       = useState('');
  const [issueNow, setIssueNow]       = useState(true);

  // Single mode
  const [singleLpoNumber, setSingleLpoNumber] = useState('');
  const [singleBranch, setSingleBranch]       = useState({ branchId: null, branchNameRaw: '' });

  // Batch mode
  const [batchRows, setBatchRows] = useState([EMPTY_ROW(), EMPTY_ROW()]);

  const reset = useCallback(() => {
    setDate(new Date().toISOString().split('T')[0]);
    setDeliveryDate('');
    setPersonId('');
    setIssueNow(true);
    setSingleLpoNumber('');
    setSingleBranch({ branchId: null, branchNameRaw: '' });
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

  // Resolve branch — if custom name, suggest it first then get the ID back
  const resolveBranch = async ({ branchId, branchNameRaw }) => {
    if (branchId) return { branchId, branchNameRaw };
    if (branchNameRaw?.trim()) {
      const res = await api.post('/branches/suggest', { name: branchNameRaw.trim() });
      return { branchId: res.data._id, branchNameRaw: res.data.name };
    }
    return { branchId: null, branchNameRaw: '' };
  };

  const validateShared = () => {
    if (!personId) { toast.error('Select a responsible person'); return false; }
    if (!deliveryDate) { toast.error('Set a delivery date'); return false; }
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
    if (!validRows.length) return toast.error('Add at least one LPO');
    if (!validateShared()) return;
    setLoading(true);
    try {
      // Resolve all branches in parallel
      const resolved = await Promise.all(validRows.map((r) => resolveBranch(r)));
      const lpos = validRows.map((r, i) => ({
        lpoNumber: r.lpoNumber,
        branchId: resolved[i].branchId,
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

  const addRow = () => setBatchRows((r) => [...r, EMPTY_ROW()]);
  const removeRow = (i) => setBatchRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i, key, val) =>
    setBatchRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New LPO Entry</DialogTitle>
          <DialogDescription>Create a single order or batch multiple LPOs for the same person.</DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-2 mt-1">
          {[
            { val: 'single', icon: Package,  label: 'Single LPO'  },
            { val: 'batch',  icon: Layers,   label: 'Batch LPOs'  },
          ].map(({ val, icon: Icon, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => setMode(val)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all',
                mode === val
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/30'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4 mt-1">
          {/* ── Shared fields ── */}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>LPO Number</Label>
                <Input
                  placeholder="e.g. LPO-001"
                  className="font-mono uppercase"
                  value={singleLpoNumber}
                  onChange={(e) => setSingleLpoNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <BranchCombobox
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
                  {batchRows.filter((r) => r.lpoNumber.trim()).length} valid row{batchRows.filter((r) => r.lpoNumber.trim()).length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
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
                  💡 Batch tip: All rows share the same person and date. Each LPO can have a different branch.
                </p>
              </div>
            </div>
          )}

          {/* Issue now toggle */}
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
              {mode === 'batch' ? `Create ${batchRows.filter((r) => r.lpoNumber.trim()).length || ''} LPOs` : 'Create LPO'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
