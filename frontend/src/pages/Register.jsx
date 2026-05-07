import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authService } from '../services';
import { useAuthStore } from '../store/authStore';

export default function Register() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({
    organizationName: '', industry: '', size: '50-200',
    adminName: '', adminEmail: '', password: '',
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await authService.registerOrg(form);
      setSession(data);
      toast.success('Organization created');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold text-ink-100 mb-1.5 tracking-tight">Create your organization</h2>
      <p className="text-sm text-ink-400 mb-6">Start a 14-day trial. No credit card required.</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Organization name</label>
          <input className="input" required value={form.organizationName}
            onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Industry</label>
            <input className="input" value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div>
            <label className="label">Size</label>
            <select className="input" value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value })}>
              <option>1-10</option><option>11-50</option><option>50-200</option>
              <option>200-1000</option><option>1000+</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Your name</label>
          <input className="input" required value={form.adminName}
            onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
        </div>
        <div>
          <label className="label">Work email</label>
          <input className="input" type="email" required value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required minLength={8} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <p className="text-xs text-ink-400 mt-1.5">Minimum 8 characters.</p>
        </div>
        <button className="btn-primary w-full mt-2" disabled={loading}>
          {loading ? 'Creating…' : 'Create organization'}
        </button>
      </form>
      <p className="text-sm text-ink-300 mt-6 text-center">
        Already have an account?{' '}
        <Link to="/login" className="text-iris-300 font-medium hover:text-iris-200 transition">Sign in</Link>
      </p>
    </div>
  );
}
