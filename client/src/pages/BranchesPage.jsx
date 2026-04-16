// client/src/pages/BranchesPage.jsx

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

function BranchModal({ open, onClose, branch, onSaved }) {
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (branch) { setName(branch.name); setIsActive(branch.isActive); }
    else { setName(''); setIsActive(true); }
  }, [branch, open]);

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setLoading(true);
    try {
      if (branch) {
        const res = await api.put(`/branches/${branch._id}`, { name, isActive, isVerified: true });
        onSaved(res.data, false);
        toast.success('Branch updated');
      } else {
        const res = await api.post('/branches', { name });
        onSaved(res.data, true);
        toast.success('Branch added');
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{branch ? 'Edit Branch' : 'Add Branch'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Branch Name</Label>
            <Input placeholder="e.g. Westlands Branch" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {branch && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/30 px-4 py-3">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {branch ? 'Save' : 'Add Branch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BranchesPage() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editBranch, setEditBranch] = useState(null);

  const fetchBranches = () =>
    api.get('/branches/all').then((r) => setBranches(r.data)).finally(() => setLoading(false));

  useEffect(() => { fetchBranches(); }, []);

  const handleSaved = (saved, isNew) => {
    if (isNew) setBranches((p) => [saved, ...p]);
    else setBranches((p) => p.map((b) => (b._id === saved._id ? saved : b)));
  };

  const handleVerify = async (b) => {
    try {
      const res = await api.put(`/branches/${b._id}`, { isVerified: true, notificationRead: true, name: b.name, isActive: b.isActive });
      setBranches((p) => p.map((x) => (x._id === res.data._id ? res.data : x)));
      toast.success(`${b.name} verified!`);
    } catch { toast.error('Failed'); }
  };

  const handleMarkRead = async (b) => {
    try {
      const res = await api.put(`/branches/${b._id}`, { notificationRead: true, name: b.name, isActive: b.isActive, isVerified: b.isVerified });
      setBranches((p) => p.map((x) => (x._id === res.data._id ? res.data : x)));
    } catch {}
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Delete branch "${b.name}"?`)) return;
    try {
      await api.delete(`/branches/${b._id}`);
      setBranches((p) => p.filter((x) => x._id !== b._id));
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
  };

  const openEdit = (b) => { setEditBranch(b); setModalOpen(true); };
  const openCreate = () => { setEditBranch(null); setModalOpen(true); };

  const verified   = branches.filter((b) => b.isVerified);
  const unverified = branches.filter((b) => !b.isVerified);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Branches</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage delivery branches and verify new suggestions</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Add Branch
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total',      value: branches.length,  color: 'text-foreground' },
          { label: 'Verified',   value: verified.length,  color: 'text-emerald-400' },
          { label: 'Pending',    value: unverified.length, color: unverified.length > 0 ? 'text-amber-400' : 'text-muted-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-3xl font-display tracking-wider mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Pending notification banner */}
      {unverified.filter((b) => !b.notificationRead).length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              {unverified.filter((b) => !b.notificationRead).length} new branch{unverified.filter((b) => !b.notificationRead).length !== 1 ? 'es' : ''} suggested by team leads
            </p>
            <p className="text-xs text-amber-400/70 mt-0.5">Review and verify them below so they appear in the official dropdown.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl border border-rekker-border bg-rekker-surface animate-pulse" />)}
        </div>
      ) : (
        <Tabs defaultValue={unverified.length ? 'pending' : 'verified'}>
          <TabsList>
            <TabsTrigger value="verified">
              Verified ({verified.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="relative">
              Pending ({unverified.length})
              {unverified.filter((b) => !b.notificationRead).length > 0 && (
                <span className="ml-1.5 w-2 h-2 rounded-full bg-amber-400 inline-block" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* Verified branches */}
          <TabsContent value="verified">
            {verified.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-xl">
                <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No verified branches yet.</p>
                <Button className="mt-4" onClick={openCreate}><Plus className="w-4 h-4" />Add First Branch</Button>
              </div>
            ) : (
              <div className="rounded-xl border border-rekker-border overflow-hidden mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rekker-border bg-rekker-surface">
                      {['Branch Name', 'Status', 'Added', 'Actions'].map((h) => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {verified.map((b, i) => (
                      <tr key={b._id} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Building2 className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <span className="font-medium text-foreground">{b.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={b.isActive ? 'success' : 'pending'}>{b.isActive ? 'Active' : 'Inactive'}</Badge>
                        </td>
                        <td className="px-5 py-3 text-xs font-mono text-muted-foreground">
                          {format(new Date(b.createdAt), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(b)}><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(b)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Pending (unverified) */}
          <TabsContent value="pending">
            {unverified.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-xl mt-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No pending branches. All clear!</p>
              </div>
            ) : (
              <div className="space-y-2 mt-3">
                {unverified.map((b) => (
                  <div
                    key={b._id}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${!b.notificationRead ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-rekker-surface/30'}`}
                    onMouseEnter={() => { if (!b.notificationRead) handleMarkRead(b); }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{b.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        Suggested by {b.addedBy?.fullName || 'team lead'} · {format(new Date(b.createdAt), 'dd/MM/yy HH:mm')}
                      </p>
                    </div>
                    {!b.notificationRead && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" onClick={() => handleVerify(b)}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verify
                      </Button>
                      <Button size="sm" variant="ghost" className="hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(b)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <BranchModal open={modalOpen} onClose={() => setModalOpen(false)} branch={editBranch} onSaved={handleSaved} />
    </div>
  );
}
