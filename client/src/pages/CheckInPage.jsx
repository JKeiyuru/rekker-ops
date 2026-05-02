// client/src/pages/CheckInPage.jsx
// Primary page for merchandisers to check in/out.
// Fetches both today's sessions AND recent history so the widget
// can surface incomplete sessions from previous days for checkout.

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, MapPin } from 'lucide-react';
import CheckInWidget from '@/components/CheckInWidget';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { syncQueue } from '@/lib/offlineQueue';

export default function CheckInPage() {
  const { user }                          = useAuthStore();
  const [assignments, setAssignments]     = useState([]);
  const [sessions, setSessions]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const today = format(new Date(), 'EEEE, dd MMMM yyyy');

  useEffect(() => {
    const load = async () => {
      try {
        const [assignRes, todayRes, historyRes] = await Promise.all([
          api.get('/assignments/my'),
          api.get('/checkins/my'),
          // Fetch last 30 days of history to find incomplete sessions
          api.get('/checkins/my/history', { params: { days: 30 } }),
        ]);

        setAssignments(Array.isArray(assignRes.data) ? assignRes.data : []);

        // Merge today's sessions with history, deduplicating by _id
        const todaySessions    = Array.isArray(todayRes.data)   ? todayRes.data   : [];
        const historySessions  = Array.isArray(historyRes.data) ? historyRes.data : [];

        const todayIds = new Set(todaySessions.map((s) => s._id));
        const combined = [
          ...todaySessions,
          ...historySessions.filter((s) => !todayIds.has(s._id)),
        ];

        setSessions(combined);
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

      {/* Today's assignment summary */}
      {!loading && assignments.length > 0 && (
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4 max-w-md mx-auto">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
            Today's Assignment{assignments.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-1.5">
            {assignments.map((a) => (
              <div key={a._id} className="flex items-center gap-2 text-sm">
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-foreground font-medium">{a.branch?.name}</span>
                {a.expectedCheckIn && (
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    from {a.expectedCheckIn}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <CheckInWidget
          assignments={assignments}
          sessions={sessions}
          onSessionUpdate={handleSessionUpdate}
        />
      )}
    </div>
  );
}
