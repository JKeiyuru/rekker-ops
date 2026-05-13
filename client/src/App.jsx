// client/src/App.jsx

import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import AppLayout             from '@/components/layout/AppLayout';
import ProtectedRoute        from '@/components/ProtectedRoute';
import Login                 from '@/pages/Login';
import Dashboard             from '@/pages/Dashboard';
import LPOsPage              from '@/pages/LPOsPage';
import InvoicePage           from '@/pages/InvoicePage';
import ReportsPage           from '@/pages/ReportsPage';
import UsersPage             from '@/pages/UsersPage';
import PersonsPage           from '@/pages/PersonsPage';
import BranchesPage          from '@/pages/BranchesPage';
import CheckInPage           from '@/pages/CheckInPage';
import AssignmentsPage       from '@/pages/AssignmentsPage';
import AttendancePage        from '@/pages/AttendancePage';
import MerchandiserDashboard from '@/pages/MerchandiserDashboard';
import FreshDashboard        from '@/pages/fresh/FreshDashboard';
import TripWorkflow          from '@/pages/fresh/TripWorkflow';
import FreshLPOPage          from '@/pages/fresh/FreshLPOPage';
import FreshReportsPage      from '@/pages/fresh/FreshReportsPage';
import VehiclesPage          from '@/pages/fresh/VehiclesPage';

const ADMIN       = ['super_admin','admin'];
const PACKAGING   = ['super_admin','admin','team_lead','packaging_team_lead','viewer'];
const MERCH_MGMT  = ['super_admin','admin','team_lead','merchandising_team_lead'];
const MERCH_ALL   = [...MERCH_MGMT,'merchandiser'];
const FRESH_MGMT  = ['super_admin','admin','team_lead','fresh_team_lead'];
const FRESH_FIELD = [...FRESH_MGMT,'driver','turnboy','farm_sourcing','market_sourcing'];

function RoleRedirect() {
  const { user, loading } = useAuthStore();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const r = user.role;
  if (r === 'merchandiser')            return <Navigate to="/merch-dashboard" replace />;
  if (r === 'merchandising_team_lead') return <Navigate to="/attendance"      replace />;
  if (r === 'packaging_team_lead')     return <Navigate to="/lpos"            replace />;
  if (['driver','turnboy','farm_sourcing','market_sourcing'].includes(r)) return <Navigate to="/fresh/trip" replace />;
  if (r === 'fresh_team_lead')         return <Navigate to="/fresh"           replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { fetchMe, token } = useAuthStore();
  useEffect(() => { if (token) fetchMe(); else useAuthStore.setState({ loading: false }); }, [token]);

  const P = ({ children, roles }) => (
    <ProtectedRoute roles={roles}><AppLayout>{children}</AppLayout></ProtectedRoute>
  );

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/"   element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
      <Route path="/*"  element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

      {/* Packaging */}
      <Route path="/dashboard" element={<P roles={PACKAGING}><Dashboard /></P>} />
      <Route path="/lpos"      element={<P roles={PACKAGING}><LPOsPage /></P>} />
      <Route path="/invoices"  element={<P roles={PACKAGING}><InvoicePage /></P>} />
      <Route path="/reports"   element={<P roles={ADMIN}><ReportsPage /></P>} />

      {/* Merchandising */}
      <Route path="/merch-dashboard" element={<P roles={['merchandiser']}><MerchandiserDashboard /></P>} />
      <Route path="/checkin"         element={<P roles={MERCH_ALL}><CheckInPage /></P>} />
      <Route path="/assignments"     element={<P roles={MERCH_MGMT}><AssignmentsPage /></P>} />
      <Route path="/attendance"      element={<P roles={MERCH_MGMT}><AttendancePage /></P>} />

      {/* Fresh Produce */}
      <Route path="/fresh"          element={<P roles={FRESH_MGMT}><FreshDashboard /></P>} />
      <Route path="/fresh/trip"     element={<P roles={FRESH_FIELD}><TripWorkflow /></P>} />
      <Route path="/fresh/lpos"     element={<P roles={FRESH_FIELD}><FreshLPOPage /></P>} />
      <Route path="/fresh/reports"  element={<P roles={FRESH_MGMT}><FreshReportsPage /></P>} />
      <Route path="/fresh/vehicles" element={<P roles={ADMIN}><VehiclesPage /></P>} />

      {/* Admin */}
      <Route path="/users"    element={<P roles={ADMIN}><UsersPage /></P>} />
      <Route path="/persons"  element={<P roles={ADMIN}><PersonsPage /></P>} />
      <Route path="/branches" element={<P roles={ADMIN}><BranchesPage /></P>} />
    </Routes>
  );
}
