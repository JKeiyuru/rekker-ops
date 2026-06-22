// client/src/pages/deliveries/DeliveryTripWorkflow.jsx
// Field-ops workflow for ordinary-goods drivers. Mirrors fresh TripWorkflow against /packaging-trips.

import { useState, useEffect, useCallback } from 'react';
import {
  Truck, Play, MapPin, ArrowRight, LogOut, Loader2,
  AlertTriangle, CheckCircle2, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { enqueue } from '@/lib/offlineQueue';
import toast from 'react-hot-toast';

// Wrap a write call so it falls back to the offline queue on network failure.
async function callOrQueue({ method, url, body }, kind) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueue(kind, { method, url, body });
    toast(`Saved offline — will sync when online`, { icon: '📶' });
    return { offline: true };
  }
  try {
    const res = await (method === 'PATCH' ? api.patch(url, body) : api.post(url, body));
    return res.data;
  } catch (err) {
    // No HTTP status => network error => queue
    if (!err?.response) {
      enqueue(kind, { method, url, body });
      toast(`Saved offline — will sync when online`, { icon: '📶' });
      return { offline: true };
    }
    throw err;
  }
}

const FIXED_LOCATIONS = ['Go-Down', 'Warehouse', 'DC'];
const DELAY_CATEGORIES = [
  { value: 'traffic', label: 'Traffic' },
  { value: 'loading_delay', label: 'Loading Delay' },
  { value: 'unloading_delay', label: 'Unloading Delay' },
  { value: 'vehicle_issue', label: 'Vehicle Issue' },
  { value: 'rain', label: 'Rain' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'customer_delay', label: 'Customer Delay' },
  { value: 'other', label: 'Other' },
];

function useGPS() {
  return {
    capture: useCallback(() => new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }), []),
  };
}

function DestinationPicker({ value, onChange, excludeLocation = '', branches = [] }) {
  const [search, setSearch] = useState('');
  const opts = [...FIXED_LOCATIONS, ...branches.map((b) => b.name)]
    .filter((l, i, a) => a.indexOf(l) === i && l !== excludeLocation);
  const filtered = search ? opts.filter((l) => l.toLowerCase().includes(search.toLowerCase())) : opts;
  return (
    <div className="space-y-3">
      {opts.length > 6 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search…" className="pl-9 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
        {filtered.map((loc) => (
          <button key={loc} type="button" onClick={() => onChange(loc)}
            className={cn(
              'py-3 px-3 rounded-xl border text-sm font-medium transition-all text-left',
              value === loc ? 'border-primary bg-primary/15 text-primary' : 'border-border hover:border-primary/50'
            )}>
            <MapPin className="w-3.5 h-3.5 inline mr-1.5 opacity-60" />{loc}
          </button>
        ))}
      </div>
    </div>
  );
}

function StartModal({ open, onClose, onStarted, branches }) {
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [helperIds, setHelperIds] = useState([]);
  const [startLoc, setStartLoc] = useState('Go-Down');
  const [firstDest, setFirstDest] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { capture } = useGPS();

  useEffect(() => {
    if (!open) return;
    setStep(1); setVehicleId(''); setHelperIds([]); setStartLoc('Go-Down'); setFirstDest('');
    api.get('/vehicles').then(r => setVehicles(r.data || []));
    api.get('/users').then(r => {
      const allowed = ['goods_driver','goods_turnboy','merchandiser'];
      setUsers((r.data || []).filter(u => allowed.includes(u.role) && u.isActive));
    });
  }, [open]);

  const toggle = (id) => setHelperIds(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  const handleStart = async () => {
    if (!vehicleId) return toast.error('Select a vehicle');
    if (!firstDest) return toast.error('Select your first destination');
    setLoading(true);
    const { lat, lng } = await capture();
    try {
      const res = await api.post('/packaging-trips/start', { vehicleId, helperIds, startLocation: startLoc, firstDestination: firstDest, lat, lng });
      toast.success('Day started');
      onStarted(res.data); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Delivery</DialogTitle>
          <DialogDescription>{step === 1 ? 'Vehicle & turnboy/merchandiser.' : 'Where to first?'}</DialogDescription>
        </DialogHeader>
        {step === 1 ? (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
                <SelectContent>{vehicles.map(v => <SelectItem key={v._id} value={v._id}>{v.regNumber}{v.description ? ` — ${v.description}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Starting From</Label>
              <Select value={startLoc} onValueChange={setStartLoc}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FIXED_LOCATIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Turnboy / Merchandiser</Label>
              <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-accent/20 min-h-[44px] max-h-40 overflow-auto">
                {users.map(u => {
                  const sel = helperIds.includes(u._id);
                  return (
                    <button key={u._id} type="button" onClick={() => toggle(u._id)}
                      className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        sel ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground')}>
                      {u.fullName} <span className="opacity-50 text-[10px]">{u.role === 'merchandiser' ? '· merch' : ''}</span>
                    </button>
                  );
                })}
                {users.length === 0 && <p className="text-xs text-muted-foreground">No turnboys/merchandisers found.</p>}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={() => setStep(2)} disabled={!vehicleId}>Next <ArrowRight className="w-4 h-4" /></Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <DestinationPicker value={firstDest} onChange={setFirstDest} excludeLocation={startLoc} branches={branches} />
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button className="flex-1" onClick={handleStart} disabled={loading || !firstDest}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DelayModal({ open, onClose, sessionId, onLogged }) {
  const [cat, setCat] = useState(''); const [notes, setNotes] = useState(''); const [dur, setDur] = useState('');
  const [loading, setLoading] = useState(false);
  const save = async () => {
    if (!cat) return toast.error('Select a category');
    setLoading(true);
    try { await api.post(`/packaging-trips/${sessionId}/delay`, { category: cat, notes, durationMin: Number(dur) || 0 }); toast('Delay logged', { icon: '⚠️' }); onLogged(); onClose(); }
    catch { toast.error('Failed'); } finally { setLoading(false); setCat(''); setNotes(''); setDur(''); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Log Delay</DialogTitle><DialogDescription>Record the reason.</DialogDescription></DialogHeader>
        <div className="space-y-3 mt-2">
          <Select value={cat} onValueChange={setCat}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>{DELAY_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" min="0" placeholder="Duration min" value={dur} onChange={e => setDur(e.target.value)} />
          <Textarea rows={2} placeholder="Notes…" value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" variant="warning" onClick={save} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Log</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DeliveryTripWorkflow() {
  const [session, setSession] = useState(null);
  const [stages, setStages] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [act, setAct] = useState(false);
  const [openStart, setOpenStart] = useState(false);
  const [openDelay, setOpenDelay] = useState(false);
  const [nextDest, setNextDest] = useState('');
  const [endConfirm, setEndConfirm] = useState(false);
  const { capture } = useGPS();

  const activeStage = stages.find(s => s.status === 'in_transit' || s.status === 'arrived');

  useEffect(() => { api.get('/branches').then(r => setBranches(r.data || [])).catch(() => {}); }, []);

  const fetchSession = useCallback(async () => {
    try {
      const res = await api.get('/packaging-trips/my-active');
      if (res.data) { setSession(res.data); setStages(res.data.stages || []); }
      else { setSession(null); setStages([]); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { if (!session) return; const t = setInterval(fetchSession, 30000); return () => clearInterval(t); }, [session, fetchSession]);

  const arrive = async () => {
    setAct(true); const { lat, lng } = await capture();
    try {
      const dest = activeStage?.toLocation && activeStage.toLocation !== 'en_route' ? activeStage.toLocation : nextDest;
      const data = await callOrQueue({ method: 'POST', url: `/packaging-trips/${session._id}/arrive`, body: { location: dest, lat, lng } }, 'TRIP_ARRIVE');
      if (data?.offline) { toast.success(`Arrival at ${dest} queued`); await fetchSession(); }
      else { setSession(data); setStages(data.stages || []); toast.success(`Arrived at ${dest}`); }
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setAct(false); }
  };
  const depart = async () => {
    if (!nextDest) return toast.error('Pick a destination');
    setAct(true); const { lat, lng } = await capture();
    try {
      const data = await callOrQueue({ method: 'POST', url: `/packaging-trips/${session._id}/depart`, body: { nextLocation: nextDest, lat, lng } }, 'TRIP_DEPART');
      if (data?.offline) { toast.success(`Departure to ${nextDest} queued`); setNextDest(''); await fetchSession(); }
      else { setSession(data); setStages(data.stages || []); setNextDest(''); toast.success(`En route to ${nextDest}`); }
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setAct(false); }
  };
  const endDay = async () => {
    setAct(true); const { lat, lng } = await capture();
    try {
      const data = await callOrQueue({ method: 'POST', url: `/packaging-trips/${session._id}/end`, body: { lat, lng } }, 'TRIP_END');
      if (data?.offline) { toast.success('End-of-day queued'); setEndConfirm(false); }
      else { setSession(null); setStages([]); setEndConfirm(false); toast.success('Day ended'); }
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setAct(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (!session) return (
    <div className="max-w-md mx-auto space-y-6 py-10 text-center">
      <Truck className="w-12 h-12 mx-auto text-primary" />
      <div>
        <h1 className="page-title">Ready to roll?</h1>
        <p className="text-sm text-muted-foreground mt-1">Start a delivery trip to begin tracking.</p>
      </div>
      <Button size="lg" onClick={() => setOpenStart(true)}><Play className="w-4 h-4" /> Start Delivery</Button>
      <StartModal open={openStart} onClose={() => setOpenStart(false)} onStarted={(d) => { setSession(d); setStages(d.stages || []); }} branches={branches} />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="rounded-2xl border border-rekker-border bg-rekker-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Current</p>
            <p className="text-2xl font-bold text-primary mt-1">{session.currentLocation || '—'}</p>
          </div>
          <Button variant="warning" size="sm" onClick={() => setOpenDelay(true)}><AlertTriangle className="w-3.5 h-3.5" /> Delay</Button>
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-2">{session.vehicle?.regNumber} · {session.totalStages} stage{session.totalStages!==1?'s':''}</p>
      </div>

      {activeStage?.status === 'in_transit' && activeStage.toLocation !== 'en_route' ? (
        <div className="rounded-2xl border border-rekker-border bg-rekker-surface p-5 space-y-3">
          <p className="text-sm">En route to <span className="font-bold text-primary">{activeStage.toLocation}</span></p>
          <Button className="w-full" size="lg" onClick={arrive} disabled={act}>
            {act ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Arrived
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-rekker-border bg-rekker-surface p-5 space-y-3">
          <DestinationPicker value={nextDest} onChange={setNextDest} excludeLocation={session.currentLocation} branches={branches} />
          <Button className="w-full" size="lg" onClick={depart} disabled={act || !nextDest}>
            {act ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Depart
          </Button>
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={() => setEndConfirm(true)}><LogOut className="w-4 h-4" /> End Day</Button>

      <Dialog open={endConfirm} onOpenChange={setEndConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>End delivery day?</DialogTitle><DialogDescription>Close out and lock today's trip.</DialogDescription></DialogHeader>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" className="flex-1" onClick={() => setEndConfirm(false)}>Cancel</Button>
            <Button className="flex-1" onClick={endDay} disabled={act}>{act ? <Loader2 className="w-4 h-4 animate-spin" /> : null} End Day</Button>
          </div>
        </DialogContent>
      </Dialog>

      <DelayModal open={openDelay} onClose={() => setOpenDelay(false)} sessionId={session._id} onLogged={fetchSession} />
    </div>
  );
}
