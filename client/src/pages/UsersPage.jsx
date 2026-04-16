// client/src/pages/UsersPage.jsx

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, UserCheck, UserX, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ROLE_CONFIG = {
  super_admin: { label: 'Super Admin', variant: 'default' },
  admin:       { label: 'Admin',       variant: 'warning' },
  team_lead:   { label: 'Team Lead',   variant: 'secondary' },
  viewer:      { label: 'Viewer',      variant: 'outline' },
};

const ROLE_OPTIONS = ['super_admin', 'admin', 'team_lead', 'viewer'];

function UserModal({ open, onClose, user: editUser, onSaved, currentUserRole }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', fullName: '', password: '', role: 'team_lead', isActive: true });

  useEffect(() => {
    if (editUser) {
      setForm({ username: editUser.username, fullName: editUser.fullName, password: '', role: editUser.role, isActive: editUser.isActive });
    } else {
      setForm({ username: '', fullName: '', password: '', role: 'team_lead', isActive: true });
    }
  }, [editUser, open]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!editUser && !form.password) return toast.error('Password required for new users');
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editUser) {
        const res = await api.put(`/users/${editUser._id}`, payload);
        onSaved(res.data, false);
        toast.success('User updated');
      } else {
        const res = await api.post('/users', payload);
        onSaved(res.data, true);
        toast.success('User created');
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const availableRoles = currentUserRole === 'super_admin' ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => !['super_admin', 'admin'].includes(r));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editUser ? 'Edit User' : 'New User'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input placeholder="Jane Doe" value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input placeholder="jane.doe" className="font-mono" value={form.username} onChange={(e) => set('username')(e.target.value)} disabled={!!editUser} />
          </div>
          <div className="space-y-1.5">
            <Label>{editUser ? 'New Password (leave blank to keep)' : 'Password'}</Label>
            <Input type="password" placeholder="Min. 6 characters" value={form.password} onChange={(e) => set('password')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={set('role')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_CONFIG[r].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editUser && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/30 px-4 py-3">
              <Label>Active</Label>
              <Switch checked={form.isActive} onCheckedChange={set('isActive')} />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editUser ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);

  useEffect(() => {
    api.get('/users').then((r) => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  const handleSaved = (saved, isNew) => {
    if (isNew) setUsers((p) => [saved, ...p]);
    else setUsers((p) => p.map((u) => (u._id === saved._id ? saved : u)));
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user ${u.fullName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u._id}`);
      setUsers((p) => p.filter((x) => x._id !== u._id));
      toast.success('User deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const openEdit = (u) => { setEditUser(u); setModalOpen(true); };
  const openCreate = () => { setEditUser(null); setModalOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage team accounts and access control</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          New User
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl border border-rekker-border bg-rekker-surface animate-pulse" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-rekker-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rekker-border bg-rekker-surface">
                {['User', 'Username', 'Role', 'Status', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const roleCfg = ROLE_CONFIG[u.role];
                const isSelf = u._id === currentUser?._id;
                return (
                  <tr key={u._id} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold font-mono shrink-0">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{u.fullName}</p>
                          {isSelf && <p className="text-[10px] text-muted-foreground font-mono">you</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{u.username}</td>
                    <td className="px-5 py-3">
                      <Badge variant={roleCfg.variant}>{roleCfg.label}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {u.isActive
                        ? <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono"><UserCheck className="w-3.5 h-3.5" />Active</span>
                        : <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono"><UserX className="w-3.5 h-3.5" />Inactive</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground font-mono">
                      {format(new Date(u.createdAt), 'dd/MM/yy')}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(u)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        {currentUser?.role === 'super_admin' && !isSelf && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(u)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <UserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        user={editUser}
        onSaved={handleSaved}
        currentUserRole={currentUser?.role}
      />
    </div>
  );
}
