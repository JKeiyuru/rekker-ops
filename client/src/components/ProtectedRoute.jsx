// client/src/components/ProtectedRoute.jsx

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

// Role → their correct home page (used for unauthorized redirects)
function homeFor(role) {
  if (role === 'merchandiser')            return '/merch-dashboard';
  if (role === 'merchandising_team_lead') return '/attendance';
  if (role === 'packaging_team_lead')     return '/lpos';
  return '/dashboard';
}

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuthStore();

  // Still fetching auth state — show a neutral spinner, never redirect
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Loading…</p>
        </div>
      </div>
    );
  }

  // Not authenticated at all
  if (!user) return <Navigate to="/login" replace />;

  // Role restriction: send them to their own home, not /dashboard
  // (avoids blank screen when e.g. merchandiser hits /dashboard)
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return children;
}
