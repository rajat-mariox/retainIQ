import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  LayoutDashboard, Users, AlertTriangle, ClipboardList, MessageSquare,
  Settings, Bell, Building2, Heart, Activity, Trophy, FileText,
  DollarSign, AlertOctagon,
} from 'lucide-react';

const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN', ORG_ADMIN: 'ORG_ADMIN', HR_ADMIN: 'HR_ADMIN',
  MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE',
};

const itemsFor = (role) => {
  if (role === ROLES.SUPER_ADMIN) {
    return [{ to: '/super/organizations', label: 'Organizations', icon: Building2 }];
  }
  if (role === ROLES.EMPLOYEE) {
    return [
      { to: '/portal', label: 'My Wellbeing', icon: Heart },
      { to: '/portal/productivity', label: 'My Productivity', icon: Activity },
      { to: '/portal/pulse', label: 'Pulse Survey', icon: MessageSquare },
      { to: '/notifications', label: 'Notifications', icon: Bell },
    ];
  }
  if (role === ROLES.MANAGER) {
    return [
      { section: 'Retention' },
      { to: '/manager', label: 'Team Dashboard', icon: LayoutDashboard },
      { to: '/employees', label: 'My Team', icon: Users },
      { to: '/interventions', label: 'Interventions', icon: ClipboardList },
      { section: 'Workforce Intelligence' },
      { to: '/productivity', label: 'Productivity', icon: Activity },
      { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
      { to: '/alerts', label: 'Alerts', icon: AlertOctagon },
      { to: '/reports', label: 'Reports', icon: FileText },
      { section: 'Other' },
      { to: '/notifications', label: 'Notifications', icon: Bell },
    ];
  }
  return [
    { section: 'Retention' },
    { to: '/dashboard', label: 'Risk Dashboard', icon: LayoutDashboard },
    { to: '/employees', label: 'Employees', icon: Users },
    { to: '/interventions', label: 'Interventions', icon: ClipboardList },
    { to: '/pulse', label: 'Pulse Insights', icon: MessageSquare },
    { section: 'Workforce Intelligence' },
    { to: '/productivity', label: 'Productivity', icon: Activity },
    { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { to: '/alerts', label: 'Alerts', icon: AlertOctagon },
    { to: '/reports', label: 'Reports', icon: FileText },
    { to: '/roi', label: 'Employee ROI', icon: DollarSign },
    { section: 'Admin' },
    { to: '/notifications', label: 'Notifications', icon: Bell },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
};

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const items = itemsFor(user?.role);

  return (
    <aside className="w-64 m-4 mr-0 flex-shrink-0 flex flex-col glass overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #6470ff 0%, #4d52f5 100%)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.20) inset, 0 8px 20px -6px rgba(77,82,245,0.55)',
            }}>
            <span className="text-white font-bold text-lg leading-none">R</span>
          </div>
          <div>
            <p className="font-semibold text-ink-100 leading-tight">RetainIQ</p>
            <p className="text-[11px] text-ink-400 leading-tight">Workforce Intelligence</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((it, idx) => {
          if (it.section) {
            return (
              <p key={`s-${idx}`} className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                {it.section}
              </p>
            );
          }
          return (
            <NavLink key={it.to} to={it.to} end
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <it.icon size={17} strokeWidth={1.75} />
              <span>{it.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Disclaimer footer */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="rounded-xl p-3 text-[11px] text-amber-300/80 leading-relaxed flex items-start gap-2"
          style={{ background: 'linear-gradient(135deg, rgba(240,160,32,0.10), rgba(240,160,32,0.03))', border: '1px solid rgba(240,160,32,0.15)' }}>
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-amber-400" />
          <span>Decision-support insights only — never the sole basis for employment decisions.</span>
        </div>
      </div>
    </aside>
  );
}
