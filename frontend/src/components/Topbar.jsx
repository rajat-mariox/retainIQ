import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { LogOut, ChevronDown, Search, Bell } from 'lucide-react';

const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Admin', ORG_ADMIN: 'Org Admin',
  HR_ADMIN: 'HR Admin', MANAGER: 'Manager', EMPLOYEE: 'Employee',
};

export default function Topbar() {
  const navigate = useNavigate();
  const { user, organization, logout } = useAuthStore();
  const [open, setOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <header className="m-4 mb-0 flex items-center gap-4">
      {/* Search */}
      <div className="flex-1 glass px-2 py-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search employees, signals, reports…"
            className="w-full bg-transparent border-none text-sm text-ink-100 placeholder:text-ink-400 pl-9 pr-3 py-1.5 focus:outline-none"
          />
        </div>
      </div>

      {/* Notifications + User */}
      <div className="glass flex items-center gap-1 p-2">
        <button className="p-2 rounded-xl hover:bg-white/[0.06] text-ink-300 transition relative" onClick={() => navigate('/notifications')}>
          <Bell size={17} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 animate-glow-pulse" />
        </button>

        <div className="relative">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-white/[0.06] transition">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm text-white"
              style={{ background: 'linear-gradient(135deg, #8a98ff 0%, #4d52f5 100%)' }}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-ink-100 leading-tight">{user?.name}</p>
              <p className="text-[11px] text-ink-400 leading-tight">{ROLE_LABEL[user?.role] || user?.role}</p>
            </div>
            <ChevronDown size={14} className="text-ink-400" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 z-20 glass-strong overflow-hidden">
                <div className="p-3 border-b border-white/[0.06]">
                  <p className="text-sm font-medium text-ink-100">{user?.name}</p>
                  <p className="text-xs text-ink-400">{user?.email}</p>
                  <p className="text-xs text-ink-400 mt-1">{organization?.name}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-ink-200 hover:bg-white/[0.05] transition"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
