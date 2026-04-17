// client/src/App.jsx

import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

import AppLayout      from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login        from '@/pages/Login';
import Dashboard    from '@/pages/Dashboard';
import LPOsPage     from '@/pages/LPOsPage';
import InvoicePage  from '@/pages/InvoicePage';
import ReportsPage  from '@/pages/ReportsPage';
import UsersPage    from '@/pages/UsersPage';
import PersonsPage  from '@/pages/PersonsPage';
import BranchesPage from '@/pages/BranchesPage';

const ADMIN_ROLES = ['super_admin', 'admin'];
const ALL_ROLES   = ['super_admin', 'admin', 'team_lead', 'viewer'];

export default function App() {
  const { fetchMe, token } = useAuthStore();

  useEffect(() => {
    if (token) fetchMe();
    else useAuthStore.setState({ loading: false });
  }, [token]);

  const Protected = ({ children, roles }) => (
    <ProtectedRoute roles={roles}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/"         element={<Protected><Navigate to="/dashboard" replace /></Protected>} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/lpos"      element={<Protected roles={ALL_ROLES}><LPOsPage /></Protected>} />
      <Route path="/invoices"  element={<Protected roles={ALL_ROLES}><InvoicePage /></Protected>} />
      <Route path="/reports"   element={<Protected roles={ADMIN_ROLES}><ReportsPage /></Protected>} />
      <Route path="/users"     element={<Protected roles={ADMIN_ROLES}><UsersPage /></Protected>} />
      <Route path="/persons"   element={<Protected roles={ADMIN_ROLES}><PersonsPage /></Protected>} />
      <Route path="/branches"  element={<Protected roles={ADMIN_ROLES}><BranchesPage /></Protected>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
