import { Outlet } from 'react-router-dom';
import { ShieldCheck, Sparkles, Lock, Users } from 'lucide-react';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Left hero — pastel diamond mood */}
      <div className="hidden lg:flex lg:w-1/2 p-10 flex-col justify-between relative overflow-hidden">
        {/* Floating diamond ornaments */}
        <div className="absolute -top-20 -left-20 w-96 h-96 rounded-3xl rotate-45 opacity-40"
          style={{ background: 'linear-gradient(135deg, rgba(167,240,212,0.3), rgba(125,228,190,0.05))', filter: 'blur(40px)' }} />
        <div className="absolute top-1/3 right-0 w-80 h-80 rounded-3xl rotate-45 opacity-40"
          style={{ background: 'linear-gradient(135deg, rgba(255,210,184,0.3), rgba(255,177,138,0.05))', filter: 'blur(40px)' }} />
        <div className="absolute -bottom-20 left-1/4 w-96 h-96 rounded-3xl rotate-45 opacity-40"
          style={{ background: 'linear-gradient(135deg, rgba(138,152,255,0.3), rgba(77,82,245,0.05))', filter: 'blur(40px)' }} />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6470ff 0%, #4d52f5 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.20) inset, 0 8px 20px -6px rgba(77,82,245,0.55)' }}>
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <span className="text-xl font-semibold text-ink-100">RetainIQ</span>
        </div>

        <div className="relative z-10 max-w-lg">
          <p className="text-iris-300 text-sm font-medium tracking-wider uppercase mb-3">AI Workforce Intelligence</p>
          <h1 className="text-4xl xl:text-5xl font-bold text-ink-100 mb-5 leading-tight tracking-tight">
            See retention risk before it becomes attrition.
          </h1>
          <p className="text-ink-300 text-base leading-relaxed">
            Privacy-first workforce intelligence. Combine HR, productivity, and engagement signals to surface employees who need support — and act before they leave.
          </p>

          <div className="grid grid-cols-1 gap-3 mt-8">
            {[
              { Icon: Lock, text: 'No surveillance — no keystroke logging, no screen recording' },
              { Icon: Sparkles, text: 'AI-driven insights with deterministic fallback' },
              { Icon: Users, text: 'Multi-tenant, role-based access, full audit trail' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-ink-200">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-iris-300 flex-shrink-0">
                  <f.Icon size={14} />
                </div>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-ink-500">© RetainIQ. Built to retain — not surveil.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md glass p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
