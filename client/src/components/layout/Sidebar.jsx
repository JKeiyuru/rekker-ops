// client/src/components/layout/Sidebar.jsx

import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, BarChart3, Users, UserCog,
  LogOut, ChevronRight, Zap, Building2, Receipt,
  MapPin, CalendarCheck, ClipboardList,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

// ── Role sets ─────────────────────────────────────────────────────────────────
const PACKAGING_ROLES  = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead', 'viewer'];
const MERCH_ROLES      = ['super_admin', 'admin', 'team_lead', 'merchandising_team_lead'];
const MERCH_ALL        = [...MERCH_ROLES, 'merchandiser'];
const ADMIN_ROLES      = ['super_admin', 'admin'];
const ALL_ROLES        = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead', 'merchandising_team_lead', 'viewer'];

const NAV_SECTIONS = [
  {
    label: 'Packaging',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',        roles: PACKAGING_ROLES },
      { to: '/lpos',      icon: FileText,        label: 'LPO Workflow',     roles: PACKAGING_ROLES },
      { to: '/invoices',  icon: Receipt,         label: 'Invoice Workflow', roles: PACKAGING_ROLES },
      { to: '/reports',   icon: BarChart3,       label: 'Reports',          roles: ADMIN_ROLES     },
    ],
  },
  {
    label: 'Merchandising',
    items: [
      { to: '/merch-dashboard', icon: LayoutDashboard, label: 'My Dashboard',  roles: ['merchandiser'] },
      { to: '/checkin',         icon: MapPin,          label: 'Check-In',      roles: MERCH_ALL        },
      { to: '/assignments',     icon: CalendarCheck,   label: 'Assignments',   roles: MERCH_ROLES      },
      { to: '/attendance',      icon: ClipboardList,   label: 'Attendance',    roles: MERCH_ROLES      },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/users',    icon: Users,     label: 'Users',    roles: ADMIN_ROLES },
      { to: '/persons',  icon: UserCog,   label: 'Persons',  roles: ADMIN_ROLES },
      { to: '/branches', icon: Building2, label: 'Branches', roles: ADMIN_ROLES },
    ],
  },
];

const ROLE_LABELS = {
  super_admin:               'Super Admin',
  admin:                     'Admin',
  packaging_team_lead:       'Packaging Lead',
  merchandising_team_lead:   'Merch. Lead',
  team_lead:                 'Team Lead',
  merchandiser:              'Merchandiser',
  viewer:                    'Viewer',
};

export default function Sidebar({ pendingBranches = 0 }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-rekker-surface border-r border-rekker-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-rekker-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary rekker-glow-sm">
          <Zap className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-display text-xl tracking-widest text-foreground leading-none">REKKER</p>
          <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase mt-0.5">Operations</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter((item) => item.roles.includes(user?.role));
          if (!visible.length) return null;
          return (
            <div key={section.label}>
              <p className="px-3 mb-1 text-[9px] font-mono text-muted-foreground/60 uppercase tracking-[0.2em]">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {visible.map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                        isActive
                          ? 'bg-primary/15 text-primary border border-primary/20'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
                      )
                    }>
                    {({ isActive }) => (
                      <>
                        <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                        <span className="flex-1">{label}</span>
                        {to === '/branches' && pendingBranches > 0 && (
                          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-[9px] font-bold text-background">
                            {pendingBranches}
                          </span>
                        )}
                        {isActive && !(to === '/branches' && pendingBranches > 0) && (
                          <ChevronRight className="w-3 h-3 text-primary" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
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
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full group">
          <LogOut className="w-4 h-4 group-hover:text-destructive" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
