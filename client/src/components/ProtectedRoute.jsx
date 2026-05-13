// client/src/components/ProtectedRoute.jsx

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

function homeFor(role) {
  if (role === 'merchandiser')            return '/merch-dashboard';
  if (role === 'merchandising_team_lead') return '/attendance';
  if (role === 'packaging_team_lead')     return '/lpos';
  if (role === 'fresh_team_lead')         return '/fresh';
  if (['driver','turnboy','farm_sourcing','market_sourcing'].includes(role)) return '/fresh/trip';
  return '/dashboard';
}

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuthStore();

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

  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
