// client/src/components/layout/MobileNav.jsx
// Bottom navigation bar for mobile devices.

import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, FileText, MapPin, Truck, Users,
  MoreHorizontal, Receipt, CalendarCheck, ClipboardList,
  BarChart2, FileSpreadsheet, LogOut, Building2, UserCog, Package,
  Factory, Boxes, Beaker, PackagePlus, BarChart3, Home, Layers,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { moduleFromPath, useSidebarMode } from '@/lib/moduleScope';
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
  if (role === 'production_manager') {
    return [
      { to: '/manufacturing',           icon: Factory,     label: 'MFG'       },
      { to: '/manufacturing/products',  icon: Boxes,       label: 'Products'  },
      { to: '/manufacturing/materials', icon: Beaker,      label: 'Materials' },
      { to: '/manufacturing/cycles',    icon: BarChart3,   label: 'Runs'      },
    ];
  }
  // admin / super_admin / team_lead / viewer
  return [
    { to: '/hub',       icon: Home,            label: 'Hub'      },
    { to: '/lpos',      icon: FileText,        label: 'LPOs'     },
    { to: '/fresh/trip',icon: Truck,           label: 'Field'    },
    { to: '/checkin',   icon: MapPin,          label: 'Check-In' },
  ];
}

// Per-module quick nav for admins on mobile, surfaced in the More drawer.
const MODULE_NAVS = {
  packaging: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/lpos',      icon: FileText,        label: 'LPO Workflow' },
    { to: '/invoices',  icon: Receipt,         label: 'Invoices' },
    { to: '/reports',   icon: BarChart2,       label: 'Reports' },
  ],
  deliveries: [
    { to: '/deliveries',      icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/deliveries/trip', icon: Truck,           label: 'Field Ops' },
  ],
  merchandising: [
    { to: '/checkin',     icon: MapPin,        label: 'Check-In' },
    { to: '/assignments', icon: CalendarCheck, label: 'Assignments' },
    { to: '/attendance',  icon: ClipboardList, label: 'Attendance' },
  ],
  fresh: [
    { to: '/fresh',               icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/fresh/trip',          icon: Truck,           label: 'Field Ops' },
    { to: '/fresh/lpos',          icon: FileSpreadsheet, label: 'Supplier LPOs' },
    { to: '/fresh/customer-lpos', icon: FileText,        label: 'Customer LPOs' },
    { to: '/fresh/returns',       icon: Package,         label: 'Returns' },
    { to: '/fresh/reports',       icon: BarChart2,       label: 'Reports' },
  ],
  manufacturing: [
    { to: '/manufacturing',           icon: Factory,     label: 'Dashboard' },
    { to: '/manufacturing/products',  icon: Boxes,       label: 'Products & BOM' },
    { to: '/manufacturing/materials', icon: Beaker,      label: 'Materials' },
    { to: '/manufacturing/suppliers', icon: Building2,   label: 'Suppliers' },
    { to: '/manufacturing/receipts',  icon: PackagePlus, label: 'Goods Receipts' },
    { to: '/manufacturing/cycles',    icon: BarChart3,   label: 'Production' },
    { to: '/manufacturing/purchase',  icon: Package,     label: 'Purchase Recs' },
    { to: '/manufacturing/pricing',   icon: FileText,    label: 'Pricing' },
  ],
  admin: [
    { to: '/users',    icon: Users,     label: 'Users' },
    { to: '/persons',  icon: UserCog,   label: 'Persons' },
    { to: '/branches', icon: Building2, label: 'Branches' },
  ],
};

export default function MobileNav({ pendingBranches = 0 }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useSidebarMode();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);
  const activeModule = moduleFromPath(location.pathname);

  const primary = getPrimaryNav(user?.role || '');

  const handleLogout = () => { logout(); toast.success('Logged out'); navigate('/login'); };

  return (
    <>
      {/* More drawer overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMoreOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 max-h-[75vh] overflow-y-auto bg-rekker-surface border-t border-rekker-border rounded-t-2xl p-4 space-y-1"
            onClick={e => e.stopPropagation()}>

            {isAdmin && (
              <Link to="/hub" onClick={() => setMoreOpen(false)}
                className={cn('flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium mb-2',
                  location.pathname === '/hub' ? 'bg-primary/15 text-primary' : 'bg-accent/50 text-foreground')}>
                <Home className="w-5 h-5" /> Operations Hub
              </Link>
            )}

            {isAdmin && activeModule && (
              <div className="flex gap-1 mb-2">
                <button onClick={() => setMode('scoped')}
                  className={cn('flex-1 px-2 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider',
                    mode === 'scoped' ? 'bg-primary/15 text-primary' : 'bg-accent/30 text-muted-foreground')}>
                  This module
                </button>
                <button onClick={() => setMode('all')}
                  className={cn('flex-1 px-2 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider',
                    mode === 'all' ? 'bg-primary/15 text-primary' : 'bg-accent/30 text-muted-foreground')}>
                  <Layers className="w-3 h-3 inline" /> All
                </button>
              </div>
            )}

            {/* Scoped: show current module's full nav */}
            {isAdmin && activeModule && mode === 'scoped' && (MODULE_NAVS[activeModule] || []).map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} onClick={() => setMoreOpen(false)}
                className={({ isActive }) => cn('flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium',
                  isActive ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-accent')}>
                <Icon className="w-5 h-5" />{label}
              </NavLink>
            ))}

            {/* All mode (or non-admin): the original cross-module shortcuts */}
            {(!isAdmin || mode === 'all' || !activeModule) && (
              <>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest px-3 pb-2">All shortcuts</p>
                {[
                  { to: '/users',    icon: Users,     label: 'Users',    roles: ADMIN_ONLY },
                  { to: '/persons',  icon: UserCog,   label: 'Persons',  roles: ADMIN_ONLY },
                  { to: '/branches', icon: Building2, label: 'Branches', roles: ADMIN_ONLY },
                  { to: '/fresh/vehicles', icon: Package, label: 'Vehicles', roles: ADMIN_ONLY },
                  { to: '/reports',  icon: BarChart2, label: 'Reports',  roles: ADMIN_ONLY },
                  { to: '/fresh/reports', icon: BarChart2, label: 'Fresh Reports', roles: ['super_admin','admin','team_lead','fresh_team_lead'] },
                  { to: '/manufacturing', icon: Factory, label: 'Manufacturing', roles: ['super_admin','admin','production_manager'] },
                  { to: '/manufacturing/products', icon: Boxes, label: 'Products & BOM', roles: ['super_admin','admin','production_manager'] },
                  { to: '/manufacturing/receipts', icon: PackagePlus, label: 'Goods Receipts', roles: ['super_admin','admin','production_manager'] },
                  { to: '/manufacturing/purchase', icon: Package, label: 'Purchase Recs', roles: ['super_admin','admin','production_manager'] },
                ].filter(i => i.roles.includes(user?.role)).map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to} onClick={() => setMoreOpen(false)}
                    className={({ isActive }) => cn('flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium',
                      isActive ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-accent')}>
                    <Icon className="w-5 h-5" />{label}
                    {to === '/branches' && pendingBranches > 0 && (
                      <span className="ml-auto w-5 h-5 rounded-full bg-amber-400 text-[10px] font-bold text-background flex items-center justify-center">{pendingBranches}</span>
                    )}
                  </NavLink>
                ))}
              </>
            )}

            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 mt-2 rounded-xl text-destructive hover:bg-destructive/10 text-sm font-medium w-full">
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
