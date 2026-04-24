// client/src/App.jsx

import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

import AppLayout               from '@/components/layout/AppLayout';
import ProtectedRoute          from '@/components/ProtectedRoute';

import Login                   from '@/pages/Login';
import Dashboard               from '@/pages/Dashboard';
import LPOsPage                from '@/pages/LPOsPage';
import InvoicePage             from '@/pages/InvoicePage';
import ReportsPage             from '@/pages/ReportsPage';
import UsersPage               from '@/pages/UsersPage';
import PersonsPage             from '@/pages/PersonsPage';
import BranchesPage            from '@/pages/BranchesPage';
import CheckInPage             from '@/pages/CheckInPage';
import AssignmentsPage         from '@/pages/AssignmentsPage';
import AttendancePage          from '@/pages/AttendancePage';
import MerchandiserDashboard   from '@/pages/MerchandiserDashboard';

// ── Role groups ───────────────────────────────────────────────────────────────
const ADMIN       = ['super_admin', 'admin'];
// Packaging: legacy team_lead + new packaging_team_lead + admins + viewers
const PACKAGING   = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead', 'viewer'];
// Merchandising management: admins + legacy team_lead + new merch lead
const MERCH_MGMT  = ['super_admin', 'admin', 'team_lead', 'merchandising_team_lead'];
// Merchandising all: includes the merchandisers themselves
const MERCH_ALL   = [...MERCH_MGMT, 'merchandiser'];

// ── Smart landing page per role ───────────────────────────────────────────────
// This is a component so it always reads the latest user from the store
function RoleRedirect() {
  const { user, loading } = useAuthStore();

  if (loading) return null; // ProtectedRoute already shows spinner

  if (!user) return <Navigate to="/login" replace />;

  const role = user.role;
  if (role === 'merchandiser')              return <Navigate to="/merch-dashboard" replace />;
  if (role === 'merchandising_team_lead')   return <Navigate to="/attendance" replace />;
  if (role === 'packaging_team_lead')       return <Navigate to="/lpos" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { fetchMe, token } = useAuthStore();

  useEffect(() => {
    if (token) fetchMe();
    else useAuthStore.setState({ loading: false });
  }, [token]);

  const P = ({ children, roles }) => (
    <ProtectedRoute roles={roles}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Smart redirect — reads user AFTER auth resolves */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RoleRedirect />
          </ProtectedRoute>
        }
      />

      {/* ── Packaging module ── */}
      <Route path="/dashboard" element={<P roles={PACKAGING}><Dashboard /></P>} />
      <Route path="/lpos"      element={<P roles={PACKAGING}><LPOsPage /></P>} />
      <Route path="/invoices"  element={<P roles={PACKAGING}><InvoicePage /></P>} />
      <Route path="/reports"   element={<P roles={ADMIN}><ReportsPage /></P>} />

      {/* ── Merchandising module ── */}
      <Route path="/merch-dashboard" element={<P roles={['merchandiser']}><MerchandiserDashboard /></P>} />
      <Route path="/checkin"         element={<P roles={MERCH_ALL}><CheckInPage /></P>} />
      <Route path="/assignments"     element={<P roles={MERCH_MGMT}><AssignmentsPage /></P>} />
      <Route path="/attendance"      element={<P roles={MERCH_MGMT}><AttendancePage /></P>} />

      {/* ── Admin ── */}
      <Route path="/users"    element={<P roles={ADMIN}><UsersPage /></P>} />
      <Route path="/persons"  element={<P roles={ADMIN}><PersonsPage /></P>} />
      <Route path="/branches" element={<P roles={ADMIN}><BranchesPage /></P>} />

      {/* Catch-all — send to role-appropriate home */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <RoleRedirect />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
