// client/src/components/layout/AppLayout.jsx

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

export default function AppLayout({ children }) {
  const { user } = useAuthStore();
  const [pendingBranches, setPendingBranches] = useState(0);
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);

  useEffect(() => {
    if (!isAdmin) return;
    const check = () =>
      api.get('/branches/pending-count')
        .then((r) => setPendingBranches(r.data.count))
        .catch(() => {});
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar pendingBranches={pendingBranches} />
      <main className="flex-1 ml-60 min-h-screen overflow-auto">
        <div className="max-w-screen-2xl mx-auto px-6 py-6">{children}</div>
      </main>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(220 17% 10%)',
            color: 'hsl(210 20% 92%)',
            border: '1px solid hsl(220 17% 18%)',
            fontFamily: 'Sora, sans-serif',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#FF6B2C', secondary: '#0F1117' } },
        }}
      />
    </div>
  );
}
