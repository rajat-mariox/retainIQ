import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authService } from '../services';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

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
      navigate(dest);
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
        <p>HR Admin: <code className="text-iris-300">hr@acme.test</code> / <code className="text-iris-300">HrPass!234</code></p>
        <p>Manager: <code className="text-iris-300">manager1@acme.test</code> / <code className="text-iris-300">ManagerPass!234</code></p>
        <p>Employee: <code className="text-iris-300">emp1@acme.test</code> / <code className="text-iris-300">EmployeePass!234</code></p>
      </div>
    </div>
  );
}
