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
const PACKAGING   = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead', 'viewer'];
const MERCH_MGMT  = ['super_admin', 'admin', 'team_lead', 'merchandising_team_lead'];
const MERCH_ALL   = [...MERCH_MGMT, 'merchandiser'];

export default function App() {
  const { fetchMe, token, user } = useAuthStore();

  useEffect(() => {
    if (token) fetchMe();
    else useAuthStore.setState({ loading: false });
  }, [token]);

  const P = ({ children, roles }) => (
    <ProtectedRoute roles={roles}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );

  // Default landing page based on role
  const defaultRedirect = () => {
    if (!user) return '/dashboard';
    if (user.role === 'merchandiser') return '/merch-dashboard';
    if (user.role === 'merchandising_team_lead') return '/attendance';
    if (user.role === 'packaging_team_lead') return '/lpos';
    return '/dashboard';
  };

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Smart redirect based on role */}
      <Route path="/" element={<ProtectedRoute><Navigate to={defaultRedirect()} replace /></ProtectedRoute>} />

      {/* Packaging module */}
      <Route path="/dashboard" element={<P roles={PACKAGING}><Dashboard /></P>} />
      <Route path="/lpos"      element={<P roles={PACKAGING}><LPOsPage /></P>} />
      <Route path="/invoices"  element={<P roles={PACKAGING}><InvoicePage /></P>} />
      <Route path="/reports"   element={<P roles={ADMIN}><ReportsPage /></P>} />

      {/* Merchandising module */}
      <Route path="/merch-dashboard" element={<P roles={['merchandiser']}><MerchandiserDashboard /></P>} />
      <Route path="/checkin"         element={<P roles={MERCH_ALL}><CheckInPage /></P>} />
      <Route path="/assignments"     element={<P roles={MERCH_MGMT}><AssignmentsPage /></P>} />
      <Route path="/attendance"      element={<P roles={MERCH_MGMT}><AttendancePage /></P>} />

      {/* Admin */}
      <Route path="/users"    element={<P roles={ADMIN}><UsersPage /></P>} />
      <Route path="/persons"  element={<P roles={ADMIN}><PersonsPage /></P>} />
      <Route path="/branches" element={<P roles={ADMIN}><BranchesPage /></P>} />

      <Route path="*" element={<Navigate to={defaultRedirect()} replace />} />
    </Routes>
  );
}
