// client/src/components/layout/Sidebar.jsx

import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, FileText, BarChart3, Users, UserCog,
  LogOut, ChevronRight, Zap, Building2, Receipt,
  MapPin, CalendarCheck, ClipboardList, Truck,
  Package, FileSpreadsheet, BarChart2, Factory,
  Beaker, Boxes, Tag, RotateCcw, ShoppingCart, History,
  PackagePlus, ShoppingBag, Lightbulb, Home, Filter, Layers,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { moduleFromPath, useSidebarMode } from '@/lib/moduleScope';
import toast from 'react-hot-toast';

const PACKAGING  = ['super_admin','admin','team_lead','packaging_team_lead','viewer'];
const PACKAGING_PM = [...PACKAGING, 'production_manager'];
const MERCH_MGMT = ['super_admin','admin','team_lead','merchandising_team_lead'];
const MERCH_ALL  = [...MERCH_MGMT,'merchandiser'];
const FRESH_MGMT = ['super_admin','admin','team_lead','fresh_team_lead'];
const FRESH_FIELD= ['super_admin','admin','team_lead','fresh_team_lead','driver','turnboy','farm_sourcing','market_sourcing'];
const DELIVERY_MGMT = ['super_admin','admin','team_lead','packaging_team_lead'];
const DELIVERY_FIELD = [...DELIVERY_MGMT, 'goods_driver', 'goods_turnboy', 'merchandiser'];
const MFG_ALL = ['super_admin','admin','production_manager'];
const ADMIN_ONLY = ['super_admin','admin'];

const NAV_SECTIONS = [
  { key: 'packaging', label: 'Packaging', items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',        roles: PACKAGING_PM },
      { to: '/lpos',      icon: FileText,        label: 'LPO Workflow',     roles: PACKAGING  },
      { to: '/invoices',  icon: Receipt,         label: 'Invoice Workflow', roles: PACKAGING  },
      { to: '/reports',   icon: BarChart3,       label: 'Reports',          roles: ADMIN_ONLY },
  ]},
  { key: 'deliveries', label: 'Deliveries', items: [
      { to: '/deliveries',          icon: LayoutDashboard, label: 'Dashboard',  roles: DELIVERY_MGMT },
      { to: '/deliveries/trip',     icon: Truck,           label: 'Field Ops',  roles: DELIVERY_FIELD },
      { to: '/deliveries/my-trips', icon: History,         label: 'My Trips',   roles: DELIVERY_FIELD },
  ]},
  { key: 'merchandising', label: 'Merchandising', items: [
      { to: '/merch-dashboard', icon: LayoutDashboard, label: 'My Dashboard',  roles: ['merchandiser']  },
      { to: '/checkin',         icon: MapPin,          label: 'Check-In',      roles: MERCH_ALL         },
      { to: '/assignments',     icon: CalendarCheck,   label: 'Assignments',   roles: MERCH_MGMT        },
      { to: '/attendance',      icon: ClipboardList,   label: 'Attendance',    roles: MERCH_MGMT        },
  ]},
  { key: 'fresh', label: 'Fresh Produce', items: [
      { to: '/fresh',               icon: LayoutDashboard,  label: 'Dashboard',     roles: FRESH_MGMT  },
      { to: '/fresh/operations',    icon: FileSpreadsheet,  label: 'Operations',    roles: FRESH_MGMT  },
      { to: '/fresh/insights',      icon: BarChart2,        label: 'Insights',      roles: FRESH_MGMT  },
      { to: '/fresh/alerts',        icon: Zap,              label: 'Alerts',        roles: FRESH_MGMT  },
      { to: '/fresh/trip',          icon: Truck,            label: 'Field Ops',     roles: FRESH_FIELD },
      { to: '/fresh/lpos',          icon: FileSpreadsheet,  label: 'Supplier LPOs', roles: FRESH_FIELD },
      { to: '/fresh/customer-lpos', icon: ShoppingCart,     label: 'Customer LPOs', roles: FRESH_MGMT  },
      { to: '/fresh/returns',       icon: RotateCcw,        label: 'Returns',       roles: FRESH_MGMT  },
      { to: '/fresh/reports',       icon: BarChart2,        label: 'Reports',       roles: FRESH_MGMT  },
      { to: '/fresh/reason-codes',  icon: Tag,              label: 'Reason Codes',  roles: FRESH_MGMT  },
      { to: '/fresh/vehicles',      icon: Package,          label: 'Vehicles',      roles: ADMIN_ONLY  },
  ]},
  { key: 'manufacturing', label: 'Manufacturing', items: [
      { to: '/manufacturing',           icon: Factory,        label: 'Dashboard',    roles: MFG_ALL    },
      { to: '/manufacturing/products',  icon: Boxes,          label: 'Products & BOM', roles: MFG_ALL  },
      { to: '/manufacturing/materials', icon: Beaker,         label: 'Materials',    roles: MFG_ALL    },
      { to: '/manufacturing/suppliers', icon: Building2,      label: 'Suppliers',    roles: MFG_ALL    },
      { to: '/manufacturing/receipts',  icon: PackagePlus,    label: 'Goods Receipts', roles: MFG_ALL  },
      { to: '/manufacturing/cycles',    icon: BarChart3,      label: 'Production',   roles: MFG_ALL    },
      { to: '/manufacturing/purchase',  icon: ShoppingBag,    label: 'Purchase Recs',roles: MFG_ALL    },
      { to: '/manufacturing/pricing',   icon: Tag,            label: 'Pricing',      roles: ADMIN_ONLY },
      { to: '/manufacturing/whatif',    icon: Lightbulb,      label: 'What-If',      roles: ADMIN_ONLY },
      { to: '/manufacturing/audit',     icon: History,        label: 'Cost Audit',   roles: MFG_ALL    },
  ]},
  { key: 'admin', label: 'Admin', items: [
      { to: '/users',    icon: Users,     label: 'Users',    roles: ADMIN_ONLY },
      { to: '/persons',  icon: UserCog,   label: 'Persons',  roles: ADMIN_ONLY },
      { to: '/branches', icon: Building2, label: 'Branches', roles: ADMIN_ONLY },
  ]},
];

const ROLE_LABELS = {
  super_admin: 'Super Admin', admin: 'Admin',
  packaging_team_lead: 'Packaging Lead', merchandising_team_lead: 'Merch. Lead',
  fresh_team_lead: 'Fresh Lead', team_lead: 'Team Lead', merchandiser: 'Merchandiser',
  driver: 'Driver', turnboy: 'Turnboy', farm_sourcing: 'Farm Sourcing',
  market_sourcing: 'Market Sourcing', goods_driver: 'Goods Driver',
  goods_turnboy: 'Goods Turnboy', production_manager: 'Production Mgr', viewer: 'Viewer',
};

export default function Sidebar({ pendingBranches = 0 }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useSidebarMode();

  const handleLogout = () => { logout(); toast.success('Logged out'); navigate('/login'); };
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);
  const activeModule = moduleFromPath(location.pathname);
  // Admins can scope; others (single-module roles) always see filtered view by role anyway.
  const scoped = isAdmin && mode === 'scoped' && activeModule;

  const sections = NAV_SECTIONS
    .filter(s => !scoped || s.key === activeModule)
    .map(s => ({ ...s, visible: s.items.filter(i => i.roles.includes(user?.role)) }))
    .filter(s => s.visible.length);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-rekker-surface border-r border-rekker-border">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-rekker-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary rekker-glow-sm">
          <Zap className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-display text-xl tracking-widest text-foreground leading-none">REKKER</p>
          <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase mt-0.5">Operations</p>
        </div>
      </div>

      {isAdmin && (
        <div className="px-3 pt-3 space-y-2">
          <Link to="/hub" className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
            location.pathname === '/hub'
              ? 'bg-primary/15 text-primary border-primary/30'
              : 'text-muted-foreground border-rekker-border hover:text-foreground hover:bg-accent'
          )}>
            <Home className="w-3.5 h-3.5" /> Operations Hub
          </Link>
          <div className="flex items-center gap-1 px-1">
            <button onClick={() => setMode('scoped')}
              className={cn('flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors',
                mode === 'scoped' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              <Filter className="w-3 h-3" /> Module
            </button>
            <button onClick={() => setMode('all')}
              className={cn('flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors',
                mode === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              <Layers className="w-3 h-3" /> All
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.key}>
            <p className="px-3 mb-1 text-[9px] font-mono text-muted-foreground/60 uppercase tracking-[0.2em]">{section.label}</p>
            <div className="space-y-0.5">
              {section.visible.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                    isActive ? 'bg-primary/15 text-primary border border-primary/20'
                             : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
                  )}>
                  {({ isActive }) => (
                    <>
                      <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                      <span className="flex-1">{label}</span>
                      {to === '/branches' && pendingBranches > 0 && (
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-[9px] font-bold text-background">{pendingBranches}</span>
                      )}
                      {isActive && !(to === '/branches' && pendingBranches > 0) && <ChevronRight className="w-3 h-3 text-primary" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        {scoped && (
          <button onClick={() => setMode('all')} className="w-full text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary px-3 py-2">
            + Show all modules
          </button>
        )}
      </nav>

      <div className="px-3 pb-4 border-t border-rekker-border pt-4">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent/50 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-primary text-xs font-bold font-mono">{user?.fullName?.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{user?.fullName}</p>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{ROLE_LABELS[user?.role] || user?.role}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full group">
          <LogOut className="w-4 h-4 group-hover:text-destructive" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
