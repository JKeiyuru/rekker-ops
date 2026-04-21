// client/src/components/CheckInWidget.jsx
// Mobile-first check-in/out widget used on the CheckInPage.
// Handles GPS capture, distance validation, offline queuing, and sync.

import { useState, useEffect, useCallback } from 'react';
import {
  MapPin, LogIn, LogOut, Wifi, WifiOff, AlertTriangle,
  CheckCircle2, XCircle, Loader2, Clock, Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { enqueueCheckIn, enqueueCheckOut, syncQueue, getUnsyncedCount } from '@/lib/offlineQueue';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// ── Status display config ─────────────────────────────────────────────────────
const STATUS_UI = {
  VALID:             { label: 'On Location',       color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 },
  MISMATCH:          { label: 'Wrong Location',    color: 'text-destructive',  bg: 'bg-destructive/10 border-destructive/30',  icon: XCircle      },
  LOCATION_DISABLED: { label: 'GPS Disabled',      color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',    icon: AlertTriangle },
  OFFLINE:           { label: 'Offline Entry',     color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30',      icon: WifiOff       },
  ACTIVE:            { label: 'Checked In',        color: 'text-primary',     bg: 'bg-primary/10 border-primary/30',        icon: LogIn         },
  COMPLETE:          { label: 'Complete',           color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 },
  INCOMPLETE:        { label: 'Incomplete',         color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',    icon: AlertTriangle },
  FLAGGED:           { label: 'Flagged',            color: 'text-destructive',  bg: 'bg-destructive/10 border-destructive/30',  icon: XCircle      },
};

function StatusPill({ status }) {
  const cfg = STATUS_UI[status] || STATUS_UI.ACTIVE;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border', cfg.bg, cfg.color)}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

// ── GPS capture hook ──────────────────────────────────────────────────────────
function useGPS() {
  const [position, setPosition] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [loading, setLoading]   = useState(false);

  const capture = useCallback(() => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsError('GPS not supported on this device');
        resolve({ lat: null, lng: null, available: false });
        return;
      }
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, available: true };
          setPosition(coords);
          setGpsError(null);
          setLoading(false);
          resolve(coords);
        },
        (err) => {
          setGpsError(err.message || 'GPS unavailable');
          setLoading(false);
          resolve({ lat: null, lng: null, available: false });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  return { position, gpsError, loading, capture };
}

// ── Active session card ───────────────────────────────────────────────────────
function ActiveSessionCard({ session, onCheckOut, checkingOut }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(session.checkInTime)) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [session.checkInTime]);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Active Session</p>
          <p className="font-semibold text-foreground mt-0.5">{session.branch?.name}</p>
        </div>
        <StatusPill status={session.checkInStatus} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-background/60 px-3 py-2.5">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Checked In</p>
          <p className="font-mono text-sm text-foreground mt-0.5">{format(new Date(session.checkInTime), 'HH:mm:ss')}</p>
        </div>
        <div className="rounded-lg bg-background/60 px-3 py-2.5">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Elapsed</p>
          <p className="font-mono text-sm text-primary mt-0.5">{elapsed}</p>
        </div>
      </div>

      {session.checkInDistanceMeters != null && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
          <Navigation className="w-3 h-3" />
          {session.checkInDistanceMeters}m from branch on check-in
        </div>
      )}

      <Button
        className="w-full"
        variant={checkingOut ? 'outline' : 'destructive'}
        disabled={checkingOut}
        onClick={() => onCheckOut(session)}
      >
        {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        {checkingOut ? 'Checking Out…' : 'Check Out'}
      </Button>
    </div>
  );
}

// ── Past session row ──────────────────────────────────────────────────────────
function PastSessionRow({ session }) {
  const duration = session.durationMinutes != null
    ? `${Math.floor(session.durationMinutes / 60)}h ${session.durationMinutes % 60}m`
    : '—';

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{session.branch?.name}</p>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">
          {format(new Date(session.checkInTime), 'HH:mm')}
          {session.checkOutTime ? ` → ${format(new Date(session.checkOutTime), 'HH:mm')}` : ' → active'}
          <span className="ml-2">({duration})</span>
        </p>
      </div>
      <StatusPill status={session.sessionStatus} />
    </div>
  );
}

// ── Main Widget ───────────────────────────────────────────────────────────────
export default function CheckInWidget({ assignments, sessions: initialSessions, onSessionUpdate }) {
  const [sessions, setSessions]       = useState(initialSessions || []);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [checkingIn, setCheckingIn]   = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [isOnline, setIsOnline]       = useState(navigator.onLine);
  const [unsyncedCount, setUnsyncedCount] = useState(getUnsyncedCount());
  const [syncing, setSyncing]         = useState(false);
  const { position, gpsError, loading: gpsLoading, capture } = useGPS();

  const activeSession = sessions.find((s) => !s.checkOutTime);
  const pastSessions  = sessions.filter((s) => !!s.checkOutTime);

  // Device fingerprint (basic)
  const deviceInfo = `${navigator.userAgent.slice(0, 100)} | ${screen.width}x${screen.height}`;

  useEffect(() => {
    const online  = () => { setIsOnline(true);  handleSync(); };
    const offline = () => setIsOnline(false);
    window.addEventListener('online',  online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  useEffect(() => { setSessions(initialSessions || []); }, [initialSessions]);

  const handleSync = async () => {
    if (getUnsyncedCount() === 0) return;
    setSyncing(true);
    const result = await syncQueue(api);
    setUnsyncedCount(getUnsyncedCount());
    if (result.synced > 0) toast.success(`${result.synced} offline entry synced`);
    setSyncing(false);
  };

  const handleCheckIn = async () => {
    if (!selectedBranch) return toast.error('Select a branch first');
    setCheckingIn(true);

    const coords = await capture();

    if (!coords.available && !gpsError?.includes('denied')) {
      toast.error('GPS is required to check in. Please enable location access.');
      setCheckingIn(false);
      return;
    }

    try {
      if (!isOnline) {
        // Store offline
        const entry = enqueueCheckIn({
          branchId: selectedBranch,
          branchName: assignments.find((a) => a.branch._id === selectedBranch)?.branch?.name || '',
          lat: coords.lat,
          lng: coords.lng,
          deviceInfo,
        });
        setUnsyncedCount(getUnsyncedCount());
        toast('Check-in saved offline. Will sync when online.', { icon: '📴' });
        // Add optimistic session to UI
        const optimistic = {
          _id: entry.tempId,
          branch: { name: entry.branchName, _id: selectedBranch },
          checkInTime: entry.checkInTime,
          checkInStatus: 'OFFLINE',
          checkOutTime: null,
          sessionStatus: 'ACTIVE',
          isOfflineEntry: true,
        };
        setSessions((prev) => [...prev, optimistic]);
        if (onSessionUpdate) onSessionUpdate(optimistic);
      } else {
        const res = await api.post('/checkins/checkin', {
          branchId: selectedBranch,
          lat: coords.lat,
          lng: coords.lng,
          gpsAvailable: coords.available,
          deviceInfo,
        });
        setSessions((prev) => [...prev, res.data]);
        if (onSessionUpdate) onSessionUpdate(res.data);

        if (res.data.checkInStatus === 'MISMATCH') {
          toast('⚠️ Checked in, but you appear to be at the wrong location.', { duration: 5000 });
        } else if (res.data.checkInStatus === 'LOCATION_DISABLED') {
          toast('Checked in without GPS. Location unverified.', { icon: '⚠️' });
        } else {
          toast.success(`Checked in at ${res.data.branch?.name}!`);
        }
      }
      setSelectedBranch('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async (session) => {
    setCheckingOut(true);
    const coords = await capture();

    try {
      if (!isOnline || session.isOfflineEntry) {
        enqueueCheckOut(session._id, { lat: coords.lat, lng: coords.lng });
        setUnsyncedCount(getUnsyncedCount());
        setSessions((prev) =>
          prev.map((s) => s._id === session._id
            ? { ...s, checkOutTime: new Date().toISOString(), sessionStatus: 'COMPLETE' }
            : s
          )
        );
        toast('Check-out saved offline.', { icon: '📴' });
      } else {
        const res = await api.patch(`/checkins/${session._id}/checkout`, {
          lat: coords.lat,
          lng: coords.lng,
          gpsAvailable: coords.available,
        });
        setSessions((prev) => prev.map((s) => s._id === res.data._id ? res.data : s));
        if (onSessionUpdate) onSessionUpdate(res.data);
        toast.success(`Checked out. Duration: ${res.data.durationMinutes} min`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-out failed');
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* Online/Offline + Sync banner */}
      <div className={cn(
        'flex items-center justify-between px-4 py-2.5 rounded-lg border text-xs font-mono',
        isOnline ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
      )}>
        <div className="flex items-center gap-2">
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {isOnline ? 'Online' : 'Offline — entries will sync when connected'}
        </div>
        {unsyncedCount > 0 && (
          <button onClick={handleSync} disabled={syncing || !isOnline}
            className="text-primary hover:underline disabled:opacity-50 flex items-center gap-1">
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Sync {unsyncedCount}
          </button>
        )}
      </div>

      {/* GPS status */}
      {gpsError && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-400 font-mono">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {gpsError}
        </div>
      )}
      {position && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono px-1">
          <Navigation className="w-3 h-3 text-emerald-400" />
          GPS: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </div>
      )}

      {/* Active session */}
      {activeSession && (
        <ActiveSessionCard
          session={activeSession}
          onCheckOut={handleCheckOut}
          checkingOut={checkingOut}
        />
      )}

      {/* New check-in form */}
      {!activeSession && (
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Check In</p>

          {assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
              No branches assigned to you today.
              <br />Contact your team lead.
            </p>
          ) : (
            <>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your assigned branch…" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a._id} value={a.branch._id}>
                      <span className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        {a.branch.name}
                        {a.expectedCheckIn && (
                          <span className="text-xs text-muted-foreground ml-1">· from {a.expectedCheckIn}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button className="w-full" onClick={handleCheckIn}
                disabled={checkingIn || gpsLoading || !selectedBranch}>
                {(checkingIn || gpsLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {gpsLoading ? 'Getting GPS…' : checkingIn ? 'Checking In…' : 'Check In'}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Today's sessions history */}
      {pastSessions.length > 0 && (
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Today's Sessions</p>
          {pastSessions.map((s) => <PastSessionRow key={s._id} session={s} />)}
        </div>
      )}
    </div>
  );
}
