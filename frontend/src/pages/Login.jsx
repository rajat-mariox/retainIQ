import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authService, getAgentInstallerFilename, localAgentService } from '../services';
import { useAuthStore } from '../store/authStore';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const downloadActivityAgent = async () => {
    try {
      const { ticket } = await authService.agentInstallerTicket();
      const link = document.createElement('a');
      link.href = authService.agentInstallerUrl(ticket);
      link.download = getAgentInstallerFilename();
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Activity Agent download started');
      return true;
    } catch (err) {
      console.warn('Activity agent download failed:', err);
      toast.error(err.response?.data?.error || 'Could not download Activity Agent');
      return false;
    }
  };

  const launchActivityAgent = async () => {
    try {
      const { ticket } = await authService.agentLaunchTicket();
      // Setting window.location.href is what triggers Chrome's
      // "This site is trying to open …" prompt. Iframes get silently
      // suppressed for custom protocols in modern Chrome.
      window.location.href = `retainiq-agent://launch?ticket=${encodeURIComponent(ticket)}`;
      toast.success('Opening Activity Agent…');
      return true;
    } catch (err) {
      console.warn('Activity agent launch failed:', err);
      toast.error(
        err.response?.status === 404
          ? 'Agent endpoint missing — backend restart required'
          : err.response?.data?.error || 'Could not open Activity Agent'
      );
      return false;
    }
  };

  const isActivityAgentReachable = async () => {
    try {
      await localAgentService.health();
      return true;
    } catch {
      return false;
    }
  };

  const waitForActivityAgent = async () => {
    for (let i = 0; i < 8; i += 1) {
      if (await isActivityAgentReachable()) return true;
      await sleep(750);
    }
    return false;
  };

  const ensureActivityAgentAvailable = async () => {
    if (await isActivityAgentReachable()) return true;
    await launchActivityAgent();
    if (await waitForActivityAgent()) return true;
    return downloadActivityAgent();
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await authService.login(form);
      setSession(data);
      const role = data.user.role;
      const dest = role === 'SUPER_ADMIN' ? '/super/organizations'
                 : role === 'EMPLOYEE'    ? '/portal'
                 : role === 'MANAGER'     ? '/manager'
                                          : '/dashboard';
      toast.success(`Welcome back, ${data.user.name}`);
      if (role === 'EMPLOYEE' || role === 'MANAGER') {
        await ensureActivityAgentAvailable();
        // Give Chrome a moment to surface the protocol-open prompt before
        // we SPA-navigate away — without this delay the route change can
        // cancel the pending external-protocol dialog.
        setTimeout(() => navigate(dest), 800);
      } else {
        navigate(dest);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold text-ink-100 mb-1.5 tracking-tight">Welcome back</h2>
      <p className="text-sm text-ink-400 mb-6">Sign in to continue to RetainIQ.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-sm text-ink-300 mt-6 text-center">
        New to RetainIQ?{' '}
        <Link to="/register" className="text-iris-300 font-medium hover:text-iris-200 transition">
          Register your organization
        </Link>
      </p>
      <div className="mt-6 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-ink-300 space-y-1">
        <p className="font-medium text-ink-200 mb-1.5">Demo accounts (after seed):</p>
        <p>Super Admin: <code className="text-iris-300">super@retainiq.dev</code> / <code className="text-iris-300">SuperPass!234</code></p>
        <p>Org Admin: <code className="text-iris-300">admin@cravix.test</code> / <code className="text-iris-300">AdminPass!234</code></p>
        <p>HR Admin: <code className="text-iris-300">hr@cravix.test</code> / <code className="text-iris-300">HrPass!234</code></p>
        <p>Manager: <code className="text-iris-300">manager@cravix.test</code> / <code className="text-iris-300">ManagerPass!234</code></p>
        <p>Employee 1: <code className="text-iris-300">emp1@cravix.test</code> / <code className="text-iris-300">EmployeePass!234</code></p>
        <p>Employee 2: <code className="text-iris-300">emp2@cravix.test</code> / <code className="text-iris-300">EmployeePass!234</code></p>
      </div>
    </div>
  );
}
