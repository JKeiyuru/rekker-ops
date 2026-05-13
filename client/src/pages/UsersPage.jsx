// client/src/pages/UsersPage.jsx
// Three tabs: Staff, Merchandisers, Field Ops (fresh produce field roles).

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, UserCheck, UserX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  super_admin:               { label: 'Super Admin',     variant: 'default'   },
  admin:                     { label: 'Admin',           variant: 'warning'   },
  team_lead:                 { label: 'Team Lead',       variant: 'secondary' },
  packaging_team_lead:       { label: 'Packaging Lead',  variant: 'default'   },
  merchandising_team_lead:   { label: 'Merch. Lead',     variant: 'default'   },
  fresh_team_lead:           { label: 'Fresh Lead',      variant: 'default'   },
  merchandiser:              { label: 'Merchandiser',    variant: 'default'   },
  driver:                    { label: 'Driver',          variant: 'secondary' },
  turnboy:                   { label: 'Turnboy / Helper',variant: 'secondary' },
  farm_sourcing:             { label: 'Farm Sourcing',   variant: 'secondary' },
  market_sourcing:           { label: 'Market Sourcing', variant: 'secondary' },
  viewer:                    { label: 'Viewer',          variant: 'outline'   },
};

const ROLE_DESCRIPTIONS = {
  driver:         'Drives the vehicle, leads the field trip',
  turnboy:        'Vehicle helper / loader on field trips',
  farm_sourcing:  'Sources produce directly from farms',
  market_sourcing:'Sources produce from markets',
  fresh_team_lead:'Manages and monitors fresh produce operations',
};

const STAFF_ROLES  = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead', 'merchandising_team_lead', 'fresh_team_lead', 'viewer'];
const MERCH_ROLES  = ['merchandiser'];
const FRESH_FIELD_ROLES = ['driver', 'turnboy', 'farm_sourcing', 'market_sourcing'];

// ── User modal ─────────────────────────────────────────────────────────────────
function UserModal({ open, onClose, user: editUser, onSaved, currentUserRole, defaultRole = 'team_lead', availableRoles }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    username: '', fullName: '', password: '', role: defaultRole, isActive: true,
  });

  useEffect(() => {
    if (editUser) {
      setForm({ username: editUser.username, fullName: editUser.fullName, password: '', role: editUser.role, isActive: editUser.isActive });
    } else {
      setForm({ username: '', fullName: '', password: '', role: defaultRole, isActive: true });
    }
  }, [editUser, open, defaultRole]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!editUser && !form.password) return toast.error('Password required for new users');
    if (!form.fullName.trim()) return toast.error('Full name required');
    if (!form.username.trim()) return toast.error('Username required');
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
      toast.error(
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        'Failed'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editUser ? 'Edit User' : 'New User'}</DialogTitle>
          <DialogDescription>
            {editUser ? 'Update user details and permissions.' : 'Create a new user account.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input placeholder="Jane Doe" value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              placeholder="jane.doe"
              className="font-mono"
              value={form.username}
              onChange={(e) => set('username')(e.target.value)}
              disabled={!!editUser}
            />
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
                {(availableRoles || Object.keys(ROLE_CONFIG)).map((r) => (
                  <SelectItem key={r} value={r}>
                    <div className="flex flex-col">
                      <span>{ROLE_CONFIG[r]?.label || r}</span>
                      {ROLE_DESCRIPTIONS[r] && (
                        <span className="text-[11px] text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                      )}
                    </div>
                  </SelectItem>
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

// ── User table ─────────────────────────────────────────────────────────────────
function UserTable({ users, currentUser, onEdit, onDelete }) {
  return (
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
            const roleCfg = ROLE_CONFIG[u.role] || { label: u.role, variant: 'outline' };
            const isSelf  = u._id === currentUser?._id;
            return (
              <tr
                key={u._id}
                className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}
              >
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
                <td className="px-5 py-3"><Badge variant={roleCfg.variant}>{roleCfg.label}</Badge></td>
                <td className="px-5 py-3">
                  {u.isActive
                    ? <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono"><UserCheck className="w-3.5 h-3.5" />Active</span>
                    : <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono"><UserX className="w-3.5 h-3.5" />Inactive</span>}
                </td>
                <td className="px-5 py-3 text-xs font-mono text-muted-foreground">
                  {format(new Date(u.createdAt), 'dd/MM/yy')}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(u)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    {currentUser?.role === 'super_admin' && !isSelf && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(u)}>
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
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const [allUsers, setAllUsers]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [defaultRole, setDefaultRole] = useState('team_lead');
  const [availableRoles, setAvailableRoles] = useState(STAFF_ROLES);

  useEffect(() => {
    api.get('/users')
      .then((r) => setAllUsers(Array.isArray(r.data) ? r.data : []))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = (saved, isNew) => {
    if (isNew) setAllUsers((p) => [saved, ...p]);
    else setAllUsers((p) => p.map((u) => (u._id === saved._id ? saved : u)));
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user ${u.fullName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u._id}`);
      setAllUsers((p) => p.filter((x) => x._id !== u._id));
      toast.success('User deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const openEdit = (u) => {
    setDefaultRole(u.role);
    // Allow editing to any relevant role group
    setAvailableRoles(Object.keys(ROLE_CONFIG));
    setEditUser(u);
    setModalOpen(true);
  };

  const openCreate = (dr, roles) => {
    setDefaultRole(dr || 'team_lead');
    setAvailableRoles(roles || STAFF_ROLES);
    setEditUser(null);
    setModalOpen(true);
  };

  const staffUsers       = allUsers.filter((u) => STAFF_ROLES.includes(u.role));
  const merchandiserUsers = allUsers.filter((u) => MERCH_ROLES.includes(u.role));
  const freshFieldUsers  = allUsers.filter((u) => FRESH_FIELD_ROLES.includes(u.role));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage team accounts, roles, and field staff profiles
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-rekker-border bg-rekker-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="staff">
          <TabsList>
            <TabsTrigger value="staff">Staff ({staffUsers.length})</TabsTrigger>
            <TabsTrigger value="merchandisers">Merchandisers ({merchandiserUsers.length})</TabsTrigger>
            <TabsTrigger value="field">Field Ops ({freshFieldUsers.length})</TabsTrigger>
          </TabsList>

          {/* ── Staff tab ── */}
          <TabsContent value="staff" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => openCreate('team_lead', STAFF_ROLES)}>
                <Plus className="w-4 h-4" />
                New Staff User
              </Button>
            </div>
            {staffUsers.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-xl">
                <p className="text-sm text-muted-foreground">No staff users yet.</p>
              </div>
            ) : (
              <UserTable users={staffUsers} currentUser={currentUser} onEdit={openEdit} onDelete={handleDelete} />
            )}
          </TabsContent>

          {/* ── Merchandisers tab ── */}
          <TabsContent value="merchandisers" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-mono">
                Merchandisers appear in the Assignments page when scheduling daily branch visits.
              </p>
              <Button onClick={() => openCreate('merchandiser', MERCH_ROLES)}>
                <Plus className="w-4 h-4" />
                New Merchandiser
              </Button>
            </div>
            {merchandiserUsers.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-xl">
                <p className="text-sm text-muted-foreground">No merchandisers yet.</p>
                <Button className="mt-4" onClick={() => openCreate('merchandiser', MERCH_ROLES)}>
                  <Plus className="w-4 h-4" />Add First Merchandiser
                </Button>
              </div>
            ) : (
              <UserTable users={merchandiserUsers} currentUser={currentUser} onEdit={openEdit} onDelete={handleDelete} />
            )}
          </TabsContent>

          {/* ── Field Ops tab ── */}
          <TabsContent value="field" className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground font-mono">
                  Field ops staff appear in the trip workflow — drivers, helpers, and sourcing personnel.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {FRESH_FIELD_ROLES.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/50 border border-border text-[10px] font-mono text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                      {ROLE_CONFIG[r]?.label}
                    </span>
                  ))}
                </div>
              </div>
              <Button onClick={() => openCreate('driver', FRESH_FIELD_ROLES)}>
                <Plus className="w-4 h-4" />
                New Field User
              </Button>
            </div>
            {freshFieldUsers.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-xl">
                <p className="text-sm text-muted-foreground">No field ops users yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Add drivers, helpers, and sourcing staff here.</p>
                <Button className="mt-4" onClick={() => openCreate('driver', FRESH_FIELD_ROLES)}>
                  <Plus className="w-4 h-4" />Add First Field User
                </Button>
              </div>
            ) : (
              <UserTable users={freshFieldUsers} currentUser={currentUser} onEdit={openEdit} onDelete={handleDelete} />
            )}
          </TabsContent>
        </Tabs>
      )}

      <UserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        user={editUser}
        onSaved={handleSaved}
        currentUserRole={currentUser?.role}
        defaultRole={defaultRole}
        availableRoles={availableRoles}
      />
    </div>
  );
}