// client/src/pages/AssignmentsPage.jsx
// Allows admins and team leads to assign merchandisers to branches for a given day.

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, CalendarDays, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const TODAY = new Date().toISOString().split('T')[0];

// ── Assignment creation modal ─────────────────────────────────────────────────
function AssignModal({ open, onClose, onSaved, date }) {
  const [merchandisers, setMerchandisers] = useState([]);
  const [branches, setBranches]           = useState([]);
  const [rows, setRows]                   = useState([{ merchandiserId: '', branchId: '', expectedCheckIn: '' }]);
  const [loading, setLoading]             = useState(false);
  const [dataLoading, setDataLoading]     = useState(true);

  useEffect(() => {
    if (!open) return;
    setRows([{ merchandiserId: '', branchId: '', expectedCheckIn: '' }]);
    setDataLoading(true);

    Promise.all([
      api.get('/users'),
      api.get('/branches'),
    ])
      .then(([usersRes, branchesRes]) => {
        // Guard: ensure we always have arrays
        const allUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
        const merch = allUsers.filter((u) => u.role === 'merchandiser' && u.isActive);
        setMerchandisers(merch);
        setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : []);
      })
      .catch(() => {
        toast.error('Failed to load data');
        setMerchandisers([]);
        setBranches([]);
      })
      .finally(() => setDataLoading(false));
  }, [open]);

  const addRow    = () => setRows((r) => [...r, { merchandiserId: '', branchId: '', expectedCheckIn: '' }]);
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i, key, val) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  const handleSave = async () => {
    const valid = rows.filter((r) => r.merchandiserId && r.branchId);
    if (!valid.length) return toast.error('Add at least one complete assignment');
    setLoading(true);
    try {
      const assignments = valid.map((r) => ({
        merchandiserId:  r.merchandiserId,
        branchId:        r.branchId,
        expectedCheckIn: r.expectedCheckIn || null,
      }));
      const res = await api.post('/assignments/bulk', { date, assignments });
      toast.success(`${valid.length} assignment${valid.length !== 1 ? 's' : ''} saved`);
      onSaved(Array.isArray(res.data) ? res.data : []);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = (() => {
    try { return format(new Date(date + 'T00:00:00'), 'dd MMM yyyy'); }
    catch { return date; }
  })();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Merchandisers — {formattedDate}</DialogTitle>
          <DialogDescription>
            Select a merchandiser and branch for each row. Expected check-in time is optional.
          </DialogDescription>
        </DialogHeader>

        {dataLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* No merchandisers warning */}
            {merchandisers.length === 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
                No merchandisers found. Create users with the <strong>Merchandiser</strong> role first via the Users page.
              </div>
            )}

            {/* Column labels */}
            <div className="grid grid-cols-[1fr_1fr_110px_auto] gap-2 px-1">
              <Label className="text-[10px]">Merchandiser</Label>
              <Label className="text-[10px]">Branch</Label>
              <Label className="text-[10px]">Expected In</Label>
              <div />
            </div>

            {/* Rows */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_110px_auto] gap-2 items-center">
                  {/* Merchandiser */}
                  <Select
                    value={row.merchandiserId}
                    onValueChange={(v) => updateRow(i, 'merchandiserId', v)}
                    disabled={merchandisers.length === 0}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Person…" />
                    </SelectTrigger>
                    <SelectContent>
                      {merchandisers.map((m) => (
                        <SelectItem key={m._id} value={m._id}>{m.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Branch */}
                  <Select
                    value={row.branchId}
                    onValueChange={(v) => updateRow(i, 'branchId', v)}
                    disabled={branches.length === 0}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Branch…" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Expected check-in time */}
                  <Input
                    type="time"
                    className="h-8 text-sm font-mono"
                    value={row.expectedCheckIn}
                    onChange={(e) => updateRow(i, 'expectedCheckIn', e.target.value)}
                  />

                  {/* Remove row */}
                  <button
                    type="button"
                    disabled={rows.length === 1}
                    onClick={() => removeRow(i)}
                    className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              className="w-full border-dashed"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Row
            </Button>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={loading || merchandisers.length === 0}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Assignments
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssignmentsPage() {
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [assignments, setAssignments]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);

  const fetchAssignments = (date) => {
    setLoading(true);
    api.get('/assignments', { params: { date } })
      .then((r) => setAssignments(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAssignments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAssignments(selectedDate); }, [selectedDate]);

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this assignment?')) return;
    try {
      await api.delete(`/assignments/${id}`);
      setAssignments((prev) => prev.filter((a) => a._id !== id));
      toast.success('Assignment removed');
    } catch {
      toast.error('Failed to remove');
    }
  };

  const handleSaved = (newItems) => {
    if (!Array.isArray(newItems)) return;
    setAssignments((prev) => {
      const existingIds = new Set(prev.map((a) => a._id));
      return [...prev, ...newItems.filter((n) => !existingIds.has(n._id))];
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign merchandisers to branches for each day
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Assign
        </Button>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-rekker-border bg-rekker-surface">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <Label className="text-xs">View Date</Label>
        <Input
          type="date"
          className="h-8 w-44 text-sm"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(TODAY)}>Today</Button>
      </div>

      {/* Assignments table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No assignments for this date.</p>
          <Button className="mt-4" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Assignments
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rekker-border bg-rekker-surface">
                {['Merchandiser', 'Branch', 'Expected Check-In', 'Assigned By', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assignments.map((a, i) => (
                <tr
                  key={a._id}
                  className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {a.merchandiser?.fullName?.charAt(0)}
                      </div>
                      <span className="font-medium text-foreground">{a.merchandiser?.fullName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-foreground">{a.branch?.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-foreground">
                    {a.expectedCheckIn || '—'}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {a.assignedBy?.fullName || '—'}
                  </td>
                  <td className="px-5 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(a._id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssignModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        date={selectedDate}
      />
    </div>
  );
}
