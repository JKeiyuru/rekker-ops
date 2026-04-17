// client/src/components/CreateLPOModal.jsx

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, User, Layers, GitBranch, Users } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectSeparator, SelectLabel, SelectGroup,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const NEW_BRANCH_SENTINEL = '__NEW__';

const MODES = [
  { val: 'single',       icon: User,      label: 'Single',       sub: '1 person · 1 LPO · 1 branch'              },
  { val: 'same_branch',  icon: GitBranch, label: 'Same Branch',  sub: '1 person · many LPOs · 1 branch'          },
  { val: 'multi_branch', icon: Layers,    label: 'Multi-Branch', sub: '1 person · many LPOs · diff. branches'    },
  { val: 'multi_person', icon: Users,     label: 'Multi-Person', sub: 'many people · LPOs · 1 branch'            },
];

// ─────────────────────────────────────────────────────────────────────────────
// BranchSelector — dropdown with "Add new branch…" escape hatch
// ─────────────────────────────────────────────────────────────────────────────
function BranchSelector({ value, onChange, branches }) {
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
              <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
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
          <p className="text-[11px] text-amber-400 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shrink-0" />
            Admin will be notified to verify this branch
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PersonSelector
// ─────────────────────────────────────────────────────────────────────────────
function PersonSelector({ value, onChange, persons, placeholder = 'Select person…' }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {persons.map((p) => (
          <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AmountInput — KES currency field
// ─────────────────────────────────────────────────────────────────────────────
function AmountInput({ value, onChange, placeholder = '0.00' }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">KES</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10 h-8 text-sm font-mono"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared date fields
// ─────────────────────────────────────────────────────────────────────────────
function SharedDateFields({ date, setDate, deliveryDate, setDeliveryDate }) {
  return (
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const emptyLpoRow    = () => ({ lpoNumber: '', amount: '' });
const emptyMultiRow  = () => ({ lpoNumber: '', amount: '', branchId: null, branchNameRaw: '', isNew: false });
const emptyPersonRow = () => ({ lpoNumber: '', amount: '' });

// ─────────────────────────────────────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────────────────────────────────────
export default function CreateLPOModal({ open, onClose, onCreated }) {
  const [persons, setPersons]   = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [mode, setMode]         = useState('single');

  // Shared
  const [date, setDate]                 = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [issueNow, setIssueNow]         = useState(true);

  // ── single ──
  const [singleLpoNumber, setSingleLpoNumber] = useState('');
  const [singleAmount, setSingleAmount]       = useState('');
  const [singlePersonId, setSinglePersonId]   = useState('');
  const [singleBranch, setSingleBranch]       = useState({ branchId: null, branchNameRaw: '', isNew: false });

  // ── same_branch: 1 person, 1 branch, many LPO rows ──
  const [sbPersonId, setSbPersonId] = useState('');
  const [sbBranch, setSbBranch]     = useState({ branchId: null, branchNameRaw: '', isNew: false });
  const [sbRows, setSbRows]         = useState([emptyLpoRow(), emptyLpoRow()]);

  // ── multi_branch: 1 person, many LPOs each with own branch ──
  const [mbPersonId, setMbPersonId] = useState('');
  const [mbRows, setMbRows]         = useState([emptyMultiRow(), emptyMultiRow()]);

  // ── multi_person: 1 branch, persons selected at top, rows = [lpoNumber + amount + assignTo] ──
  const [mpBranch, setMpBranch]     = useState({ branchId: null, branchNameRaw: '', isNew: false });
  // persons assigned to this job (could be multiple; each LPO row can be assigned to any of them)
  const [mpPersonIds, setMpPersonIds] = useState([]); // selected at top
  const [mpRows, setMpRows]           = useState([emptyPersonRow(), emptyPersonRow()]);
  // each mpRow also has an assignedPersonId
  const emptyMpRow = () => ({ lpoNumber: '', amount: '', assignedPersonId: '' });

  const reset = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    setDate(today); setDeliveryDate(''); setIssueNow(true); setMode('single');
    setSingleLpoNumber(''); setSingleAmount(''); setSinglePersonId('');
    setSingleBranch({ branchId: null, branchNameRaw: '', isNew: false });
    setSbPersonId(''); setSbBranch({ branchId: null, branchNameRaw: '', isNew: false });
    setSbRows([emptyLpoRow(), emptyLpoRow()]);
    setMbPersonId(''); setMbRows([emptyMultiRow(), emptyMultiRow()]);
    setMpBranch({ branchId: null, branchNameRaw: '', isNew: false });
    setMpPersonIds([]);
    setMpRows([emptyMpRow(), emptyMpRow()]);
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      api.get('/persons').then((r) => setPersons(r.data));
      api.get('/branches').then((r) => setBranches(r.data));
    }
  }, [open, reset]);

  const resolveBranch = async ({ branchId, branchNameRaw, isNew }) => {
    if (!isNew && branchId) return { branchId, branchNameRaw };
    if (isNew && branchNameRaw?.trim()) {
      const res = await api.post('/branches/suggest', { name: branchNameRaw.trim() });
      return { branchId: res.data._id, branchNameRaw: res.data.name };
    }
    return { branchId: null, branchNameRaw: '' };
  };

  const validateBase = () => {
    if (!deliveryDate) { toast.error('Set a delivery date'); return false; }
    return true;
  };

  // ── Submit: single ──
  const submitSingle = async () => {
    if (!singleLpoNumber.trim()) return toast.error('LPO Number required');
    if (!singlePersonId)         return toast.error('Select a responsible person');
    if (!validateBase())         return;
    setLoading(true);
    try {
      const { branchId, branchNameRaw } = await resolveBranch(singleBranch);
      const res = await api.post('/lpos', {
        lpoNumber: singleLpoNumber, date, deliveryDate,
        responsiblePerson: singlePersonId, issuedNow: issueNow,
        branchId, branchNameRaw,
        amount: singleAmount !== '' ? Number(singleAmount) : null,
      });
      toast.success(`LPO ${res.data.lpoNumber} created!`);
      onCreated([res.data]); onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setLoading(false); }
  };

  // ── Submit: same_branch ──
  const submitSameBranch = async () => {
    const valid = sbRows.filter((r) => r.lpoNumber.trim());
    if (!valid.length)  return toast.error('Add at least one LPO number');
    if (!sbPersonId)    return toast.error('Select a responsible person');
    if (!validateBase()) return;
    setLoading(true);
    try {
      const { branchId, branchNameRaw } = await resolveBranch(sbBranch);
      const lpos = valid.map((r) => ({
        lpoNumber: r.lpoNumber, branchId, branchNameRaw, deliveryDate,
        amount: r.amount !== '' ? Number(r.amount) : null,
      }));
      const res = await api.post('/lpos/batch', { lpos, date, deliveryDate, responsiblePerson: sbPersonId, issuedNow: issueNow });
      toast.success(`${res.data.length} LPOs created!`);
      onCreated(res.data); onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setLoading(false); }
  };

  // ── Submit: multi_branch ──
  const submitMultiBranch = async () => {
    const valid = mbRows.filter((r) => r.lpoNumber.trim());
    if (!valid.length) return toast.error('Add at least one LPO number');
    if (!mbPersonId)   return toast.error('Select a responsible person');
    if (!validateBase()) return;
    setLoading(true);
    try {
      const resolved = await Promise.all(valid.map((r) => resolveBranch(r)));
      const lpos = valid.map((r, i) => ({
        lpoNumber: r.lpoNumber, branchId: resolved[i].branchId,
        branchNameRaw: resolved[i].branchNameRaw, deliveryDate,
        amount: r.amount !== '' ? Number(r.amount) : null,
      }));
      const res = await api.post('/lpos/batch', { lpos, date, deliveryDate, responsiblePerson: mbPersonId, issuedNow: issueNow });
      toast.success(`${res.data.length} LPOs created!`);
      onCreated(res.data); onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setLoading(false); }
  };

  // ── Submit: multi_person ──
  // Each row has its own assigned person from the list selected at top
  const submitMultiPerson = async () => {
    const valid = mpRows.filter((r) => r.lpoNumber.trim() && r.assignedPersonId);
    if (!valid.length)       return toast.error('Add at least one complete row (LPO + person)');
    if (!validateBase())     return;
    const missingPerson = mpRows.some((r) => r.lpoNumber.trim() && !r.assignedPersonId);
    if (missingPerson)       return toast.error('Each LPO needs a person assigned');
    setLoading(true);
    try {
      const { branchId, branchNameRaw } = await resolveBranch(mpBranch);
      // Different persons = no shared batch; create individually in parallel
      const results = await Promise.all(
        valid.map((r) =>
          api.post('/lpos', {
            lpoNumber: r.lpoNumber, date, deliveryDate,
            responsiblePerson: r.assignedPersonId, issuedNow: issueNow,
            branchId, branchNameRaw,
            amount: r.amount !== '' ? Number(r.amount) : null,
          }).then((res) => res.data)
        )
      );
      toast.success(`${results.length} LPOs created!`);
      onCreated(results); onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setLoading(false); }
  };

  const SUBMIT_MAP = { single: submitSingle, same_branch: submitSameBranch, multi_branch: submitMultiBranch, multi_person: submitMultiPerson };

  const validCount = () => {
    if (mode === 'same_branch')  return sbRows.filter((r) => r.lpoNumber.trim()).length;
    if (mode === 'multi_branch') return mbRows.filter((r) => r.lpoNumber.trim()).length;
    if (mode === 'multi_person') return mpRows.filter((r) => r.lpoNumber.trim() && r.assignedPersonId).length;
    return 1;
  };

  // Toggle a person in the multi-person top selection
  const toggleMpPerson = (id) => {
    setMpPersonIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
    // If removed, clear any rows assigned to that person
    setMpRows((rows) =>
      rows.map((r) => r.assignedPersonId === id ? { ...r, assignedPersonId: '' } : r)
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New LPO Entry</DialogTitle>
          <DialogDescription>Choose the scenario that matches how this order is being handled.</DialogDescription>
        </DialogHeader>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          {MODES.map(({ val, icon: Icon, label, sub }) => (
            <button key={val} type="button" onClick={() => setMode(val)}
              className={cn(
                'flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-all',
                mode === val ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'
              )}>
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', mode === val ? 'text-primary' : '')} />
              <div>
                <p className={cn('text-sm font-semibold leading-none', mode === val ? 'text-primary' : 'text-foreground')}>{label}</p>
                <p className="text-[11px] mt-1 leading-tight text-muted-foreground">{sub}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-4 mt-1">
          <SharedDateFields date={date} setDate={setDate} deliveryDate={deliveryDate} setDeliveryDate={setDeliveryDate} />

          {/* ══ SINGLE ══ */}
          {mode === 'single' && (
            <>
              <div className="space-y-1.5">
                <Label>Responsible Person</Label>
                <PersonSelector value={singlePersonId} onChange={setSinglePersonId} persons={persons} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>LPO Number</Label>
                  <Input placeholder="e.g. LPO-001" className="font-mono uppercase"
                    value={singleLpoNumber} onChange={(e) => setSingleLpoNumber(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>LPO Amount</Label>
                  <AmountInput value={singleAmount} onChange={setSingleAmount} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <BranchSelector value={singleBranch} onChange={setSingleBranch} branches={branches} />
              </div>
            </>
          )}

          {/* ══ SAME BRANCH ══ */}
          {mode === 'same_branch' && (
            <>
              <div className="space-y-1.5">
                <Label>Responsible Person</Label>
                <PersonSelector value={sbPersonId} onChange={setSbPersonId} persons={persons} />
              </div>
              <div className="space-y-1.5">
                <Label>Branch <span className="text-muted-foreground font-normal normal-case">(applies to all LPOs below)</span></Label>
                <BranchSelector value={sbBranch} onChange={setSbBranch} branches={branches} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>LPO Numbers &amp; Amounts</Label>
                  <p className="text-xs text-muted-foreground font-mono">{sbRows.filter((r) => r.lpoNumber.trim()).length} valid</p>
                </div>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {sbRows.map((row, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                      <Input className="font-mono uppercase h-8 text-sm" placeholder="LPO Number"
                        value={row.lpoNumber}
                        onChange={(e) => setSbRows((r) => r.map((x, idx) => idx === i ? { ...x, lpoNumber: e.target.value } : x))} />
                      <AmountInput value={row.amount}
                        onChange={(v) => setSbRows((r) => r.map((x, idx) => idx === i ? { ...x, amount: v } : x))} />
                      <button type="button" disabled={sbRows.length === 1}
                        onClick={() => setSbRows((r) => r.filter((_, idx) => idx !== i))}
                        className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground disabled:opacity-30">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setSbRows((r) => [...r, emptyLpoRow()])} className="w-full border-dashed">
                  <Plus className="w-3.5 h-3.5" />Add LPO
                </Button>
              </div>
            </>
          )}

          {/* ══ MULTI-BRANCH ══ */}
          {mode === 'multi_branch' && (
            <>
              <div className="space-y-1.5">
                <Label>Responsible Person</Label>
                <PersonSelector value={mbPersonId} onChange={setMbPersonId} persons={persons} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>LPO Entries</Label>
                  <p className="text-xs text-muted-foreground font-mono">{mbRows.filter((r) => r.lpoNumber.trim()).length} valid</p>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {mbRows.map((row, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border bg-accent/20 space-y-2">
                      <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                        <Input className="font-mono uppercase h-8 text-sm" placeholder="LPO Number"
                          value={row.lpoNumber}
                          onChange={(e) => setMbRows((r) => r.map((x, idx) => idx === i ? { ...x, lpoNumber: e.target.value } : x))} />
                        <AmountInput value={row.amount}
                          onChange={(v) => setMbRows((r) => r.map((x, idx) => idx === i ? { ...x, amount: v } : x))} />
                        <button type="button"
                          onClick={() => setMbRows((r) => r.filter((_, idx) => idx !== i))}
                          className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="pl-7">
                        <BranchSelector
                          value={{ branchId: row.branchId, branchNameRaw: row.branchNameRaw, isNew: row.isNew }}
                          onChange={(v) => setMbRows((r) => r.map((x, idx) => idx === i ? { ...x, ...v } : x))}
                          branches={branches} />
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setMbRows((r) => [...r, emptyMultiRow()])} className="w-full border-dashed">
                  <Plus className="w-3.5 h-3.5" />Add Row
                </Button>
              </div>
            </>
          )}

          {/* ══ MULTI-PERSON ══ */}
          {mode === 'multi_person' && (
            <>
              {/* Branch — selected once at top */}
              <div className="space-y-1.5">
                <Label>Branch <span className="text-muted-foreground font-normal normal-case">(applies to all LPOs below)</span></Label>
                <BranchSelector value={mpBranch} onChange={setMpBranch} branches={branches} />
              </div>

              {/* People involved — selected once at top as a chip list */}
              <div className="space-y-1.5">
                <Label>People Handling These LPOs <span className="text-muted-foreground font-normal normal-case">(select all that apply)</span></Label>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-accent/20 min-h-[44px]">
                  {persons.map((p) => {
                    const selected = mpPersonIds.includes(p._id);
                    return (
                      <button key={p._id} type="button" onClick={() => toggleMpPerson(p._id)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                          selected
                            ? 'bg-primary/15 border-primary/40 text-primary'
                            : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-border'
                        )}>
                        {p.name}
                      </button>
                    );
                  })}
                  {persons.length === 0 && <p className="text-xs text-muted-foreground">No persons in system yet</p>}
                </div>
                {mpPersonIds.length > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">{mpPersonIds.length} person{mpPersonIds.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>

              {/* LPO rows — each has [LPO Number] [Amount] [Assign to] */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>LPO Assignments</Label>
                  <p className="text-xs text-muted-foreground font-mono">
                    {mpRows.filter((r) => r.lpoNumber.trim() && r.assignedPersonId).length} complete
                  </p>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {mpRows.map((row, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-2 p-2.5 rounded-lg border border-border bg-accent/20">
                      <span className="text-xs font-mono text-muted-foreground w-5 text-right">{i + 1}.</span>
                      <Input className="font-mono uppercase h-8 text-sm" placeholder="LPO No."
                        value={row.lpoNumber}
                        onChange={(e) => setMpRows((r) => r.map((x, idx) => idx === i ? { ...x, lpoNumber: e.target.value } : x))} />
                      <AmountInput value={row.amount}
                        onChange={(v) => setMpRows((r) => r.map((x, idx) => idx === i ? { ...x, amount: v } : x))} />
                      {/* Assign to — only shows persons selected at top */}
                      <Select
                        value={row.assignedPersonId}
                        onValueChange={(v) => setMpRows((r) => r.map((x, idx) => idx === i ? { ...x, assignedPersonId: v } : x))}
                        disabled={mpPersonIds.length === 0}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={mpPersonIds.length === 0 ? 'Pick people ↑' : 'Assign to…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {persons.filter((p) => mpPersonIds.includes(p._id)).map((p) => (
                            <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button type="button" disabled={mpRows.length === 1}
                        onClick={() => setMpRows((r) => r.filter((_, idx) => idx !== i))}
                        className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground disabled:opacity-30">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setMpRows((r) => [...r, emptyMpRow()])} className="w-full border-dashed">
                  <Plus className="w-3.5 h-3.5" />Add Row
                </Button>
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
                  <p className="text-xs text-blue-400 font-mono">
                    💡 Select all people involved above first, then assign each LPO to one of them.
                  </p>
                </div>
              </div>
            </>
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
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="button" className="flex-1" disabled={loading} onClick={SUBMIT_MAP[mode]}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {mode === 'single' ? 'Create LPO' : `Create ${validCount() || ''} LPO${validCount() !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
