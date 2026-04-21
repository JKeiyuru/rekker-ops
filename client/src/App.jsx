// client/src/App.jsx

import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

import AppLayout        from '@/components/layout/AppLayout';
import ProtectedRoute   from '@/components/ProtectedRoute';

import Login            from '@/pages/Login';
import Dashboard        from '@/pages/Dashboard';
import LPOsPage         from '@/pages/LPOsPage';
import InvoicePage      from '@/pages/InvoicePage';
import ReportsPage      from '@/pages/ReportsPage';
import UsersPage        from '@/pages/UsersPage';
import PersonsPage      from '@/pages/PersonsPage';
import BranchesPage     from '@/pages/BranchesPage';
import CheckInPage      from '@/pages/CheckInPage';
import AssignmentsPage  from '@/pages/AssignmentsPage';
import AttendancePage   from '@/pages/AttendancePage';

const ADMIN       = ['super_admin', 'admin'];
const LEAD        = ['super_admin', 'admin', 'team_lead'];
const ALL         = ['super_admin', 'admin', 'team_lead', 'viewer'];
const MERCH_ALL   = ['super_admin', 'admin', 'team_lead', 'merchandiser'];

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

      {/* Packaging module */}
      <Route path="/"          element={<P><Navigate to="/dashboard" replace /></P>} />
      <Route path="/dashboard" element={<P><Dashboard /></P>} />
      <Route path="/lpos"      element={<P roles={ALL}><LPOsPage /></P>} />
      <Route path="/invoices"  element={<P roles={ALL}><InvoicePage /></P>} />
      <Route path="/reports"   element={<P roles={ADMIN}><ReportsPage /></P>} />

      {/* Merchandising module */}
      <Route path="/checkin"     element={<P roles={MERCH_ALL}><CheckInPage /></P>} />
      <Route path="/assignments" element={<P roles={LEAD}><AssignmentsPage /></P>} />
      <Route path="/attendance"  element={<P roles={LEAD}><AttendancePage /></P>} />

      {/* Admin module */}
      <Route path="/users"    element={<P roles={ADMIN}><UsersPage /></P>} />
      <Route path="/persons"  element={<P roles={ADMIN}><PersonsPage /></P>} />
      <Route path="/branches" element={<P roles={ADMIN}><BranchesPage /></P>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
