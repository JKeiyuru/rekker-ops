// client/src/pages/PersonsPage.jsx

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, UserCog, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

function PersonModal({ open, onClose, person, onSaved }) {
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (person) { setName(person.name); setIsActive(person.isActive); }
    else { setName(''); setIsActive(true); }
  }, [person, open]);

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setLoading(true);
    try {
      if (person) {
        const res = await api.put(`/persons/${person._id}`, { name, isActive });
        onSaved(res.data, false);
        toast.success('Person updated');
      } else {
        const res = await api.post('/persons', { name });
        onSaved(res.data, true);
        toast.success('Person added');
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
          <DialogTitle>{person ? 'Edit Person' : 'Add Person'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input placeholder="e.g. John Kamau" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {person && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/30 px-4 py-3">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {person ? 'Save' : 'Add Person'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PersonsPage() {
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPerson, setEditPerson] = useState(null);

  useEffect(() => {
    api.get('/persons/all').then((r) => setPersons(r.data)).finally(() => setLoading(false));
  }, []);

  const handleSaved = (saved, isNew) => {
    if (isNew) setPersons((p) => [...p, saved]);
    else setPersons((p) => p.map((x) => (x._id === saved._id ? saved : x)));
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Remove ${p.name}?`)) return;
    try {
      await api.delete(`/persons/${p._id}`);
      setPersons((prev) => prev.filter((x) => x._id !== p._id));
      toast.success('Person removed');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const openEdit = (p) => { setEditPerson(p); setModalOpen(true); };
  const openCreate = () => { setEditPerson(null); setModalOpen(true); };

  const active = persons.filter((p) => p.isActive);
  const inactive = persons.filter((p) => !p.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Responsible Persons</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage the list of packagers available for LPO assignment</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Add Person
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: persons.length, color: 'text-foreground' },
          { label: 'Active', value: active.length, color: 'text-emerald-400' },
          { label: 'Inactive', value: inactive.length, color: 'text-muted-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-3xl font-display tracking-wider mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-rekker-border bg-rekker-surface animate-pulse" />
          ))}
        </div>
      ) : persons.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <UserCog className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No persons added yet.</p>
          <Button className="mt-4" onClick={openCreate}><Plus className="w-4 h-4" />Add First Person</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rekker-border bg-rekker-surface">
                {['Name', 'Status', 'Added', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {persons.map((p, i) => (
                <tr key={p._id} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold font-mono text-foreground shrink-0">
                        {p.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <span className="font-medium text-foreground">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={p.isActive ? 'success' : 'pending'}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-muted-foreground">
                    {format(new Date(p.createdAt), 'dd/MM/yyyy')}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(p)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(p)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PersonModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        person={editPerson}
        onSaved={handleSaved}
      />
    </div>
  );
}
