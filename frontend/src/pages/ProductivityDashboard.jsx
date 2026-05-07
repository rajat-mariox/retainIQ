import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend,
} from 'recharts';
import { Activity, Award, AlertOctagon, RefreshCw, Zap, Users, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import StatCard from '../components/StatCard';
import ProductivityBadge from '../components/ProductivityBadge';
import { LoadingSpinner } from '../components/UIStates';
import { productivityService, alertService } from '../services';
import { PRODUCTIVITY_COLORS } from '../utils/format';

export default function ProductivityDashboard() {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState({ counts: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [recalc, setRecalc] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [d, a] = await Promise.all([
        productivityService.dashboard(),
        alertService.summary().catch(() => ({ counts: {}, total: 0 })),
      ]);
      setData(d); setAlerts(a);
    } catch { toast.error('Failed to load productivity dashboard'); }
    finally { setLoading(false); }
  };

  const recalcAll = async () => {
    setRecalc(true);
    try {
      const r = await productivityService.calculateAll();
      toast.success(`Computed scores for ${r.processed} employees`);
      await load();
    } catch { toast.error('Recalculation failed'); }
    finally { setRecalc(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading || !data) return <LoadingSpinner label="Loading workforce intelligence…" />;

  const bandData = Object.entries(data.bandDistribution).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Workforce Intelligence</p>
          <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Productivity</h1>
          <p className="text-sm text-ink-400 mt-1.5">Productivity, focus, burnout & ROI signals across the organization</p>
        </div>
        <div className="flex gap-2">
          <Link to="/alerts" className="btn-secondary">
            <AlertOctagon size={15} />
            {alerts.total > 0 ? `${alerts.total} alert${alerts.total === 1 ? '' : 's'}` : 'Alerts'}
          </Link>
          <button onClick={recalcAll} disabled={recalc} className="btn-secondary">
            <RefreshCw size={15} className={recalc ? 'animate-spin' : ''} />
            {recalc ? 'Computing…' : 'Recompute scores'}
          </button>
        </div>
      </div>

      {/* Pastel stat tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard tone="iris"  label="Active employees" value={data.totals.activeEmployees} sub="Currently tracking" icon={Users} />
        <StatCard tone="sky"   label="Avg. productivity" value={`${data.totals.avgScore}/100`} sub="Across organization" icon={Activity} />
        <StatCard tone="mint"  label="High performers" value={data.totals.highPerformers} sub="Score ≥ 75" icon={Award} />
        <StatCard tone="peach" label="Needs attention" value={data.totals.needsAttention} sub="Score < 50" icon={Zap} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="glass p-5">
          <h3 className="section-title mb-4">Productivity bands</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={bandData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={3} stroke="rgba(11,16,32,0.8)" strokeWidth={2}>
                {bandData.map((entry) => (
                  <Cell key={entry.name} fill={PRODUCTIVITY_COLORS[entry.name]?.hex || '#5b6691'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-5 lg:col-span-2">
          <h3 className="section-title mb-4">Department comparison</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.departmentBreakdown}>
              <defs>
                <linearGradient id="dept-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8a98ff" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#4d52f5" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="avgScore" fill="url(#dept-bar)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 30-day trend */}
      {data.monthlyTrend?.length > 1 && (
        <div className="glass p-5">
          <h3 className="section-title mb-4">30-day productivity trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.monthlyTrend}>
              <defs>
                <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8a98ff" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#4d52f5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <Tooltip />
              <Area type="monotone" dataKey="avgScore" stroke="#8a98ff" strokeWidth={2.5} fill="url(#trend-area)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top + Low performer split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="section-title flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-mint-400/15 border border-mint-400/30 flex items-center justify-center">
                <Award size={14} className="text-mint-400" />
              </span>
              Top performers
            </h3>
            <Link to="/leaderboard" className="text-xs text-iris-300 font-medium hover:text-iris-200 inline-flex items-center gap-1 transition">
              Leaderboard <ArrowRight size={12} />
            </Link>
          </div>
          <ul className="divide-y divide-white/[0.04]">
            {data.topPerformers.map((e, i) => (
              <li key={e._id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition">
                <span className="w-7 text-center text-sm font-semibold text-ink-400">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <Link to={`/employees/${e._id}`} className="font-medium text-ink-100 hover:text-iris-200 transition">{e.name}</Link>
                  <p className="text-xs text-ink-400 truncate">{e.designation} · {e.departmentId?.name || '—'}</p>
                </div>
                <ProductivityBadge band={e.currentProductivityBand} score={e.currentProductivityScore} />
              </li>
            ))}
          </ul>
        </div>

        <div className="glass overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h3 className="section-title flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-peach-400/15 border border-peach-400/30 flex items-center justify-center">
                <Zap size={14} className="text-peach-400" />
              </span>
              Needs attention
            </h3>
          </div>
          <ul className="divide-y divide-white/[0.04]">
            {data.lowPerformers.map((e) => (
              <li key={e._id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition">
                <div className="flex-1 min-w-0">
                  <Link to={`/employees/${e._id}`} className="font-medium text-ink-100 hover:text-iris-200 transition">{e.name}</Link>
                  <p className="text-xs text-ink-400 truncate">{e.designation} · {e.departmentId?.name || '—'}</p>
                </div>
                <ProductivityBadge band={e.currentProductivityBand} score={e.currentProductivityScore} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
