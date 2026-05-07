import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { Users, AlertTriangle, Activity, RefreshCw, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import StatCard from '../components/StatCard';
import RiskBadge from '../components/RiskBadge';
import { LoadingSpinner } from '../components/UIStates';
import { riskService } from '../services';
import { RISK_COLORS } from '../utils/format';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await riskService.dashboard()); }
    catch { toast.error('Failed to load dashboard'); }
    finally { setLoading(false); }
  };

  const recalcAll = async () => {
    setRecalculating(true);
    try {
      const r = await riskService.calculateAll();
      toast.success(`Scored ${r.processed} employees`);
      await load();
    } catch { toast.error('Recalculation failed'); }
    finally { setRecalculating(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading || !data) return <LoadingSpinner label="Loading dashboard…" />;

  const distribution = Object.entries(data.distribution || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Retention Intelligence</p>
          <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Risk Dashboard</h1>
          <p className="text-sm text-ink-400 mt-1.5">Workforce risk intelligence at a glance</p>
        </div>
        <button onClick={recalcAll} disabled={recalculating} className="btn-secondary">
          <RefreshCw size={15} className={recalculating ? 'animate-spin' : ''} />
          {recalculating ? 'Recalculating…' : 'Recalculate all scores'}
        </button>
      </div>

      {/* Pastel stat tiles — the headline visual */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard tone="iris"  label="Active employees" value={data.totals.employees} sub="Currently on roll" icon={Users} />
        <StatCard tone="cream" label="High risk"        value={data.totals.high}      sub="Watch closely"    icon={AlertTriangle} />
        <StatCard tone="rose"  label="Critical risk"    value={data.totals.critical}  sub="Act this week"    icon={AlertTriangle} />
        <StatCard tone="mint"  label="Avg. risk score"  value={data.totals.avgRiskScore} sub="0–100 scale"   icon={Activity} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="glass p-5 lg:col-span-1">
          <h3 className="section-title mb-4">Risk distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={3} stroke="rgba(11,16,32,0.8)" strokeWidth={2}>
                {distribution.map((entry) => (
                  <Cell key={entry.name} fill={RISK_COLORS[entry.name]?.hex || '#5b6691'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-5 lg:col-span-2">
          <h3 className="section-title mb-4">Department risk</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.departmentBreakdown}>
              <defs>
                <linearGradient id="iris-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8a98ff" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#4d52f5" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="departmentName" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <YAxis tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="avgScore" fill="url(#iris-bar)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trend */}
      {data.monthlyTrend?.length > 1 && (
        <div className="glass p-5">
          <h3 className="section-title mb-4">Monthly average risk trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.monthlyTrend}>
              <defs>
                <linearGradient id="iris-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8a98ff" />
                  <stop offset="100%" stopColor="#4d52f5" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <Tooltip />
              <Line type="monotone" dataKey="avgScore" stroke="url(#iris-line)" strokeWidth={2.5} dot={{ r: 3, fill: '#8a98ff' }} activeDot={{ r: 5, fill: '#fff', stroke: '#4d52f5', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* At-risk table */}
      <div className="glass overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="section-title">Employees needing immediate attention</h3>
          <Link to="/employees" className="text-xs text-iris-300 font-medium hover:text-iris-200 inline-flex items-center gap-1 transition">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Employee</th>
                <th className="table-th">Department</th>
                <th className="table-th">Score</th>
                <th className="table-th">Trend</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {data.topAtRisk?.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center text-ink-400 py-10">No high-risk employees right now 🎉</td></tr>
              ) : data.topAtRisk?.map((e) => (
                <tr key={e._id}>
                  <td className="table-td">
                    <div className="font-medium text-ink-100">{e.name}</div>
                    <div className="text-xs text-ink-400">{e.designation}</div>
                  </td>
                  <td className="table-td">{e.departmentId?.name || '—'}</td>
                  <td className="table-td"><RiskBadge category={e.currentRiskCategory} score={e.currentRiskScore} /></td>
                  <td className="table-td">{e.currentRiskTrend}</td>
                  <td className="table-td text-right">
                    <Link to={`/employees/${e._id}`} className="text-iris-300 text-sm font-medium hover:text-iris-200 inline-flex items-center gap-1 transition">
                      Open <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
