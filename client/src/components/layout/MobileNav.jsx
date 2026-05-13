// client/src/components/layout/MobileNav.jsx
// Bottom navigation bar for mobile devices.

import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, MapPin, Truck, Users,
  MoreHorizontal, Receipt, CalendarCheck, ClipboardList,
  BarChart2, FileSpreadsheet, LogOut, Building2, UserCog, Package,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useState } from 'react';

const PACKAGING  = ['super_admin','admin','team_lead','packaging_team_lead','viewer'];
const MERCH_ALL  = ['super_admin','admin','team_lead','merchandising_team_lead','merchandiser'];
const FRESH_FIELD= ['super_admin','admin','team_lead','fresh_team_lead','driver','turnboy','farm_sourcing','market_sourcing'];
const ADMIN_ONLY = ['super_admin','admin'];

// Primary nav items shown in bottom bar (max 4 + more)
function getPrimaryNav(role) {
  if (['driver','turnboy','farm_sourcing','market_sourcing'].includes(role)) {
    return [
      { to: '/fresh/trip',  icon: Truck,          label: 'Field Ops' },
      { to: '/fresh/lpos',  icon: FileSpreadsheet, label: 'LPOs'     },
    ];
  }
  if (role === 'fresh_team_lead') {
    return [
      { to: '/fresh',         icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/fresh/trip',    icon: Truck,           label: 'Field Ops' },
      { to: '/fresh/lpos',    icon: FileSpreadsheet, label: 'LPOs'     },
      { to: '/fresh/reports', icon: BarChart2,        label: 'Reports'  },
    ];
  }
  if (role === 'merchandiser') {
    return [
      { to: '/merch-dashboard', icon: LayoutDashboard, label: 'Home'    },
      { to: '/checkin',         icon: MapPin,          label: 'Check-In'},
    ];
  }
  if (role === 'merchandising_team_lead') {
    return [
      { to: '/checkin',     icon: MapPin,         label: 'Check-In'   },
      { to: '/assignments', icon: CalendarCheck,  label: 'Assign'     },
      { to: '/attendance',  icon: ClipboardList,  label: 'Attendance' },
    ];
  }
  if (role === 'packaging_team_lead') {
    return [
      { to: '/lpos',     icon: FileText, label: 'LPOs'     },
      { to: '/invoices', icon: Receipt,  label: 'Invoices' },
    ];
  }
  // admin / super_admin / team_lead / viewer
  return [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Home'     },
    { to: '/lpos',      icon: FileText,        label: 'LPOs'     },
    { to: '/fresh/trip',icon: Truck,           label: 'Field'    },
    { to: '/checkin',   icon: MapPin,          label: 'Check-In' },
  ];
}

export default function MobileNav({ pendingBranches = 0 }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = getPrimaryNav(user?.role || '');

  const handleLogout = () => { logout(); toast.success('Logged out'); navigate('/login'); };

  return (
    <>
      {/* More drawer overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMoreOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-rekker-surface border-t border-rekker-border rounded-t-2xl p-4 space-y-1"
            onClick={e => e.stopPropagation()}>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest px-3 pb-2">More</p>
            {[
              { to: '/users',    icon: Users,     label: 'Users',    roles: ADMIN_ONLY },
              { to: '/persons',  icon: UserCog,   label: 'Persons',  roles: ADMIN_ONLY },
              { to: '/branches', icon: Building2, label: 'Branches', roles: ADMIN_ONLY },
              { to: '/fresh/vehicles', icon: Package, label: 'Vehicles', roles: ADMIN_ONLY },
              { to: '/reports',  icon: BarChart2, label: 'Reports',  roles: ADMIN_ONLY },
              { to: '/fresh/reports', icon: BarChart2, label: 'Fresh Reports', roles: ['super_admin','admin','team_lead','fresh_team_lead'] },
            ].filter(i => i.roles.includes(user?.role)).map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} onClick={() => setMoreOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium',
                  isActive ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-accent'
                )}>
                <Icon className="w-5 h-5" />{label}
                {to === '/branches' && pendingBranches > 0 && (
                  <span className="ml-auto w-5 h-5 rounded-full bg-amber-400 text-[10px] font-bold text-background flex items-center justify-center">{pendingBranches}</span>
                )}
              </NavLink>
            ))}
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium w-full">
              <LogOut className="w-5 h-5" />Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-rekker-surface border-t border-rekker-border flex items-center justify-around px-2 pb-safe h-16">
        {primary.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => cn(
              'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[56px] touch-target',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}>
            {({ isActive }) => (
              <>
                <Icon className={cn('w-5 h-5', isActive && 'text-primary')} />
                <span className="text-[10px] font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(o => !o)}
          className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors min-w-[56px] touch-target">
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>
    </>
  );
}
