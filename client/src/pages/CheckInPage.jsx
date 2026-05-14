// client/src/pages/CheckInPage.jsx
// Loads all active branches + today's assignments (for schedule hints).
// Merchandisers can check in to any branch — assignments are optional suggestions.

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Calendar, Star } from 'lucide-react';
import CheckInWidget from '@/components/CheckInWidget';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { syncQueue } from '@/lib/offlineQueue';

export default function CheckInPage() {
  const { user }                      = useAuthStore();
  const [branches, setBranches]       = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [sessions, setSessions]       = useState([]);
  const [loading, setLoading]         = useState(true);

  const today = format(new Date(), 'EEEE, dd MMMM yyyy');

  useEffect(() => {
    const load = async () => {
      try {
        const [branchRes, assignRes, todayRes, historyRes] = await Promise.all([
          // All active verified branches — no assignment required
          api.get('/branches'),
          // Today's assignments — purely for highlighting suggested branches
          api.get('/assignments/my'),
          // Today's sessions
          api.get('/checkins/my'),
          // Last 30 days for incomplete session detection
          api.get('/checkins/my/history', { params: { days: 30 } }),
        ]);

        setBranches(Array.isArray(branchRes.data) ? branchRes.data : []);
        setAssignments(Array.isArray(assignRes.data) ? assignRes.data : []);

        const todaySessions   = Array.isArray(todayRes.data)   ? todayRes.data   : [];
        const historySessions = Array.isArray(historyRes.data) ? historyRes.data : [];
        const todayIds        = new Set(todaySessions.map((s) => s._id));
        setSessions([
          ...todaySessions,
          ...historySessions.filter((s) => !todayIds.has(s._id)),
        ]);
      } catch {
        // Silent — widget handles empty state
      } finally {
        setLoading(false);
      }
    };

    load();
    if (navigator.onLine) syncQueue(api);
  }, []);

  const handleSessionUpdate = (updated) => {
    setSessions((prev) => {
      const exists = prev.find((s) => s._id === updated._id);
      return exists
        ? prev.map((s) => (s._id === updated._id ? updated : s))
        : [...prev, updated];
    });
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">{today}</p>
        <h1 className="page-title">Check-In</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome, <span className="text-foreground font-medium">{user?.fullName}</span>
        </p>
      </div>

      {/* Scheduled visits notice */}
      {!loading && assignments.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 max-w-md mx-auto">
          <p className="text-xs font-mono text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Scheduled for today
          </p>
          <div className="space-y-1.5">
            {assignments.map((a) => (
              <div key={a._id} className="flex items-center gap-2 text-sm">
                <Star className="w-3 h-3 text-primary shrink-0" />
                <span className="text-foreground font-medium">{a.branch?.name}</span>
                {a.expectedCheckIn && (
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    from {a.expectedCheckIn}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground font-mono mt-2 pt-2 border-t border-border">
            You can also check in to any other branch below.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <CheckInWidget
          branches={branches}
          assignments={assignments}
          sessions={sessions}
          onSessionUpdate={handleSessionUpdate}
        />
      )}
    </div>
  );
}