// client/src/pages/fresh/VehiclesPage.jsx
import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Loader2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format } from 'date-fns';
import api from '@/lib/api';
import toast from 'react-hot-toast';

function VehicleModal({ open, onClose, vehicle, onSaved }) {
  const [regNumber, setRegNumber]     = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive]       = useState(true);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    if (vehicle) { setRegNumber(vehicle.regNumber); setDescription(vehicle.description || ''); setIsActive(vehicle.isActive); }
    else { setRegNumber(''); setDescription(''); setIsActive(true); }
  }, [vehicle, open]);

  const handleSave = async () => {
    if (!regNumber.trim()) return toast.error('Registration number required');
    setLoading(true);
    try {
      if (vehicle) {
        const res = await api.put(`/vehicles/${vehicle._id}`, { regNumber, description, isActive });
        onSaved(res.data, false); toast.success('Vehicle updated');
      } else {
        const res = await api.post('/vehicles', { regNumber, description });
        onSaved(res.data, true); toast.success('Vehicle added');
      }
      onClose();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{vehicle ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
          <DialogDescription>Enter the vehicle registration and description.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Registration Number</Label>
            <Input placeholder="e.g. KDA 123A" className="font-mono uppercase" value={regNumber} onChange={e => setRegNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="e.g. Isuzu NPR — White" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {vehicle && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/30 px-4 py-3">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {vehicle ? 'Save' : 'Add Vehicle'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VehiclesPage() {
  const [vehicles, setVehicles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);

  useEffect(() => { api.get('/vehicles/all').then(r => setVehicles(r.data || [])).finally(() => setLoading(false)); }, []);

  const handleSaved = (saved, isNew) => {
    if (isNew) setVehicles(p => [saved, ...p]);
    else setVehicles(p => p.map(v => v._id === saved._id ? saved : v));
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Delete vehicle ${v.regNumber}?`)) return;
    try { await api.delete(`/vehicles/${v._id}`); setVehicles(p => p.filter(x => x._id !== v._id)); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1 className="page-title">Vehicles</h1><p className="text-sm text-muted-foreground mt-1">Manage the fresh produce fleet</p></div>
        <Button onClick={() => { setEditVehicle(null); setModalOpen(true); }}><Plus className="w-4 h-4" />Add Vehicle</Button>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        : vehicles.length === 0
        ? <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No vehicles yet.</p>
            <Button className="mt-4" onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" />Add First Vehicle</Button>
          </div>
        : <div className="rounded-xl border border-rekker-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rekker-border bg-rekker-surface">
                  {['Vehicle', 'Description', 'Status', 'Added', 'Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v, i) => (
                  <tr key={v._id} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i % 2 !== 0 ? 'bg-rekker-surface/20' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Truck className="w-4 h-4 text-primary" /></div>
                        <span className="font-mono font-semibold text-foreground">{v.regNumber}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-sm">{v.description || '—'}</td>
                    <td className="px-5 py-3"><Badge variant={v.isActive ? 'success' : 'pending'}>{v.isActive ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{format(new Date(v.createdAt), 'dd/MM/yy')}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditVehicle(v); setModalOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(v)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

      <VehicleModal open={modalOpen} onClose={() => setModalOpen(false)} vehicle={editVehicle} onSaved={handleSaved} />
    </div>
  );
}
