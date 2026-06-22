// client/src/components/layout/AppLayout.jsx

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import NotificationsBell from '@/components/NotificationsBell';
import ThemeToggle from '@/components/ThemeToggle';
import OnlineStatusBadge from '@/components/OnlineStatusBadge';
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
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar pendingBranches={pendingBranches} />
      </div>

      <main className="flex-1 md:ml-60 min-h-screen overflow-auto pb-20 md:pb-0">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
          <div className="flex justify-end items-center gap-2 mb-4">
            <OnlineStatusBadge />
            <ThemeToggle />
            <NotificationsBell />
          </div>
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <div className="md:hidden">
        <MobileNav pendingBranches={pendingBranches} />
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            fontFamily: 'Sora, sans-serif',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: 'hsl(var(--primary))', secondary: 'hsl(var(--background))' } },
        }}
      />
    </div>
  );
}
