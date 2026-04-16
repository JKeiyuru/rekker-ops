// client/src/pages/Dashboard.jsx

import { useEffect, useState } from 'react';
import { FileText, CheckCheck, AlertTriangle, TrendingUp, Package, Clock, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary', bg = 'bg-primary/10' }) {
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5 flex items-start gap-4 animate-fade-up hover:border-primary/30 transition-colors">
      <div className={cn('flex items-center justify-center w-10 h-10 rounded-lg shrink-0', bg)}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-3xl font-display tracking-wider text-foreground mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const canViewReports = ['super_admin', 'admin'].includes(user?.role);
    if (canViewReports) {
      api.get('/reports/summary')
        .then((r) => setSummary(r.data))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  const canViewReports = ['super_admin', 'admin'].includes(user?.role);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
          {format(new Date(), 'EEEE, dd MMMM yyyy')}
        </p>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, <span className="text-foreground font-medium">{user?.fullName}</span>
        </p>
      </div>

      {canViewReports && (
        <>
          {/* Today's Stats */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 rounded-full bg-primary" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">Today</h2>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-xl border border-rekker-border bg-rekker-surface p-5 h-24 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={Package}
                  label="Total LPOs"
                  value={summary?.today?.total}
                  sub="Created today"
                  color="text-primary"
                  bg="bg-primary/10"
                />
                <StatCard
                  icon={CheckCheck}
                  label="Checked"
                  value={summary?.today?.checked}
                  sub={`${summary?.today?.total ? Math.round((summary.today.checked / summary.today.total) * 100) : 0}% completion`}
                  color="text-emerald-400"
                  bg="bg-emerald-500/10"
                />
                <StatCard
                  icon={Clock}
                  label="Completed"
                  value={summary?.today?.completed}
                  sub="Packed, pending check"
                  color="text-blue-400"
                  bg="bg-blue-500/10"
                />
                <StatCard
                  icon={AlertTriangle}
                  label="Errors"
                  value={summary?.today?.withErrors}
                  sub="LPOs with issues"
                  color="text-destructive"
                  bg="bg-destructive/10"
                />
              </div>
            )}
          </section>

          {/* All Time */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 rounded-full bg-muted-foreground/40" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">All Time</h2>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="rounded-xl border border-rekker-border bg-rekker-surface p-5 h-24 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={FileText}
                  label="Total LPOs"
                  value={summary?.allTime?.total}
                  sub="All time"
                  color="text-primary"
                  bg="bg-primary/10"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Error Rate"
                  value={
                    summary?.allTime?.total
                      ? `${Math.round((summary.allTime.withErrors / summary.allTime.total) * 100)}%`
                      : '0%'
                  }
                  sub="LPOs with any error"
                  color="text-amber-400"
                  bg="bg-amber-500/10"
                />
              </div>
            )}
          </section>
        </>
      )}

      {/* Quick Actions */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { to: '/lpos', icon: Package, label: 'LPO Workflow', desc: 'View and manage packaging orders', show: true },
            { to: '/reports', icon: TrendingUp, label: 'Reports', desc: 'Performance analytics and exports', show: canViewReports },
            { to: '/users', icon: Zap, label: 'User Management', desc: 'Manage team accounts and roles', show: canViewReports },
          ]
            .filter((a) => a.show)
            .map(({ to, icon: Icon, label, desc }) => (
              <a
                key={to}
                href={to}
                className="group rounded-xl border border-rekker-border bg-rekker-surface p-5 hover:border-primary/40 hover:bg-accent/20 transition-all flex items-start gap-4"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </a>
            ))}
        </div>
      </section>
    </div>
  );
}
