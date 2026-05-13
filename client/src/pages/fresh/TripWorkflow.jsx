// client/src/pages/fresh/TripWorkflow.jsx
// The guided step-by-step mobile workflow for drivers/field staff.
// Follows the principle: "The system guides users, not the other way around."

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Truck, Play, MapPin, ArrowRight, LogOut, Loader2,
  AlertTriangle, Plus, CheckCircle2, Clock, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import RouteTimeline from '@/components/fresh/RouteTimeline';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const LOCATIONS = ['Go-Down', 'Market', 'Farm', 'DC', 'Warehouse', 'Other'];

const DELAY_CATEGORIES = [
  { value: 'traffic',          label: 'Traffic'              },
  { value: 'supplier_delay',   label: 'Supplier Delay'       },
  { value: 'loading_delay',    label: 'Loading Delay'        },
  { value: 'vehicle_issue',    label: 'Vehicle Issue'        },
  { value: 'rain',             label: 'Rain'                 },
  { value: 'breakdown',        label: 'Breakdown'            },
  { value: 'waiting_approval', label: 'Waiting for Approval' },
  { value: 'other',            label: 'Other'                },
];

function useGPS() {
  const capture = useCallback(() => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      ()  => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }), []);
  return { capture };
}

// ── Start Day Modal ───────────────────────────────────────────────────────────
function StartDayModal({ open, onClose, onStarted }) {
  const [vehicles, setVehicles]   = useState([]);
  const [users, setUsers]         = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [helperIds, setHelperIds] = useState([]);
  const [startLoc, setStartLoc]   = useState('Go-Down');
  const [loading, setLoading]     = useState(false);
  const { capture } = useGPS();

  useEffect(() => {
    if (open) {
      api.get('/vehicles').then(r => setVehicles(r.data || []));
      api.get('/users').then(r => {
        const fieldRoles = ['driver','turnboy','farm_sourcing','market_sourcing','fresh_team_lead'];
        setUsers((r.data || []).filter(u => fieldRoles.includes(u.role) && u.isActive));
      });
    }
  }, [open]);

  const toggleHelper = (id) =>
    setHelperIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const handleStart = async () => {
    if (!vehicleId) return toast.error('Select a vehicle');
    setLoading(true);
    const { lat, lng } = await capture();
    try {
      const res = await api.post('/trips/start', { vehicleId, helperIds, startLocation: startLoc, lat, lng });
      toast.success('Day started!');
      onStarted(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start');
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Start Day</DialogTitle>
          <DialogDescription>Select your vehicle and team before heading out.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v._id} value={v._id}>
                    {v.regNumber}{v.description ? ` — ${v.description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Starting Location</Label>
            <Select value={startLoc} onValueChange={setStartLoc}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOCATIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Team Members <span className="text-muted-foreground font-normal">(select helpers)</span></Label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-accent/20 min-h-[44px]">
              {users.map(u => {
                const sel = helperIds.includes(u._id);
                return (
                  <button key={u._id} type="button" onClick={() => toggleHelper(u._id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      sel ? 'bg-primary/15 border-primary/40 text-primary'
                          : 'bg-background border-border text-muted-foreground hover:text-foreground'
                    )}>
                    {u.fullName}
                  </button>
                );
              })}
              {users.length === 0 && <p className="text-xs text-muted-foreground">No field staff found</p>}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleStart} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Day
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Delay Logger Modal ────────────────────────────────────────────────────────
function DelayModal({ open, onClose, sessionId, onLogged }) {
  const [category, setCategory] = useState('');
  const [notes, setNotes]       = useState('');
  const [duration, setDuration] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSave = async () => {
    if (!category) return toast.error('Select a delay category');
    setLoading(true);
    try {
      await api.post(`/trips/${sessionId}/delay`, {
        category, notes, durationMin: duration ? Number(duration) : 0,
      });
      toast('Delay logged', { icon: '⚠️' });
      onLogged();
      onClose();
    } catch { toast.error('Failed to log delay'); }
    finally { setLoading(false); setCategory(''); setNotes(''); setDuration(''); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log Delay</DialogTitle>
          <DialogDescription>Record the reason for the delay.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent>
                {DELAY_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Duration (minutes) <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <input type="number" min="0" placeholder="e.g. 30"
              className="flex h-9 w-full rounded-md border border-input bg-input px-3 py-1 text-sm"
              value={duration} onChange={e => setDuration(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea rows={2} placeholder="Additional details…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" variant="warning" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Log Delay
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Workflow Page ────────────────────────────────────────────────────────
export default function TripWorkflow() {
  const { user } = useAuthStore();
  const [session, setSession]       = useState(null);
  const [stages, setStages]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [startOpen, setStartOpen]   = useState(false);
  const [delayOpen, setDelayOpen]   = useState(false);
  const [nextDest, setNextDest]     = useState('');
  const [endConfirm, setEndConfirm] = useState(false);
  const { capture } = useGPS();

  const activeStage = stages.find(s => s.status === 'in_transit' || s.status === 'arrived');

  const fetchSession = useCallback(async () => {
    try {
      const res = await api.get('/trips/my-active');
      if (res.data) { setSession(res.data); setStages(res.data.stages || []); }
      else { setSession(null); setStages([]); }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  // Auto-refresh every 30s while active
  useEffect(() => {
    if (!session) return;
    const t = setInterval(fetchSession, 30000);
    return () => clearInterval(t);
  }, [session, fetchSession]);

  const handleArrive = async () => {
    setActionLoading(true);
    const { lat, lng } = await capture();
    try {
      const dest = activeStage?.toLocation && activeStage.toLocation !== 'en_route'
        ? activeStage.toLocation : nextDest;
      const res = await api.post(`/trips/${session._id}/arrive`, { location: dest, lat, lng });
      setSession(res.data); setStages(res.data.stages || []);
      toast.success(`Arrived at ${dest}`);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setActionLoading(false); }
  };

  const handleDepart = async () => {
    if (!nextDest) return toast.error('Select next destination');
    setActionLoading(true);
    const { lat, lng } = await capture();
    try {
      const res = await api.post(`/trips/${session._id}/depart`, { nextLocation: nextDest, lat, lng });
      setSession(res.data); setStages(res.data.stages || []);
      setNextDest('');
      toast.success(`En route to ${nextDest}`);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setActionLoading(false); }
  };

  const handleEndDay = async () => {
    setActionLoading(true);
    const { lat, lng } = await capture();
    try {
      const res = await api.post(`/trips/${session._id}/end`, { lat, lng });
      setSession(null); setStages([]);
      setEndConfirm(false);
      toast.success('Day ended. Great work!');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setActionLoading(false); }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── No active session ──
  if (!session) {
    return (
      <div className="max-w-sm mx-auto space-y-6 pt-6">
        <div>
          <h1 className="page-title">Field Ops</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.fullName?.split(' ')[0]}
          </p>
        </div>

        <div className="rounded-2xl border border-rekker-border bg-rekker-surface p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-lg">No active trip</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start your day to begin tracking your route.
            </p>
          </div>
          <Button size="lg" className="w-full text-base" onClick={() => setStartOpen(true)}>
            <Play className="w-5 h-5" />
            Start Day
          </Button>
        </div>

        <StartDayModal open={startOpen} onClose={() => setStartOpen(false)}
          onStarted={(s) => { setSession(s); setStages(s.stages || []); }} />
      </div>
    );
  }

  // ── Active session ──
  const isInTransit = activeStage?.status === 'in_transit';
  const isArrived   = activeStage?.status === 'arrived';

  return (
    <div className="max-w-sm mx-auto space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title text-2xl">Field Ops</h1>
          <p className="text-xs font-mono text-muted-foreground">{format(new Date(), 'EEE dd MMM · HH:mm')}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-primary">{session.vehicle?.regNumber}</p>
          <p className="text-xs text-muted-foreground">{session.driver?.fullName}</p>
        </div>
      </div>

      {/* Current status card */}
      <div className={cn(
        'rounded-2xl border p-5 space-y-4',
        isInTransit ? 'border-primary/30 bg-primary/5' : 'border-emerald-500/30 bg-emerald-500/5'
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            isInTransit ? 'bg-primary/15' : 'bg-emerald-500/15'
          )}>
            {isInTransit
              ? <Truck className="w-5 h-5 text-primary animate-pulse" />
              : <MapPin className="w-5 h-5 text-emerald-400" />}
          </div>
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              {isInTransit ? 'In Transit' : 'Currently At'}
            </p>
            <p className="text-lg font-bold text-foreground">
              {isInTransit
                ? (activeStage?.toLocation && activeStage.toLocation !== 'en_route'
                    ? `→ ${activeStage.toLocation}` : 'En Route…')
                : session.currentLocation}
            </p>
          </div>
        </div>

        {/* Action: In transit → Arrive button */}
        {isInTransit && (
          <Button size="lg" variant="success" className="w-full text-base" onClick={handleArrive} disabled={actionLoading}>
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            I've Arrived
          </Button>
        )}

        {/* Action: Arrived → select next destination */}
        {isArrived && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground text-center">Where are you going next?</p>
            <div className="grid grid-cols-2 gap-2">
              {LOCATIONS.filter(l => l !== session.currentLocation).map(loc => (
                <button key={loc} type="button"
                  onClick={() => setNextDest(loc)}
                  className={cn(
                    'py-3 rounded-xl border text-sm font-medium transition-all',
                    nextDest === loc
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-background text-foreground hover:border-primary/50'
                  )}>
                  {loc}
                </button>
              ))}
            </div>
            {nextDest && (
              <Button size="lg" className="w-full text-base" onClick={handleDepart} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                Depart to {nextDest}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="w-full" onClick={() => setDelayOpen(true)}>
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Log Delay
        </Button>
        <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setEndConfirm(true)}>
          <LogOut className="w-4 h-4" />
          End Day
        </Button>
      </div>

      {/* Trip stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Stages', value: stages.filter(s => s.status === 'completed').length },
          { label: 'Delay', value: session.totalDelayMinutes ? `${session.totalDelayMinutes}m` : 'None' },
          { label: 'Started', value: session.dayStartTime ? format(new Date(session.dayStartTime), 'HH:mm') : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-rekker-border bg-rekker-surface p-3 text-center">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-lg font-display text-foreground mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Route timeline */}
      <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Today's Route</p>
        <RouteTimeline stages={stages} />
      </div>

      {/* End day confirm */}
      <Dialog open={endConfirm} onOpenChange={setEndConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>End Day?</DialogTitle>
            <DialogDescription>This will close today's trip session. Make sure you're back at the base.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setEndConfirm(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleEndDay} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              End Day
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DelayModal open={delayOpen} onClose={() => setDelayOpen(false)}
        sessionId={session._id} onLogged={fetchSession} />
    </div>
  );
}
