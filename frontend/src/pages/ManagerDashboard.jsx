import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, AlertTriangle, ClipboardList, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeService } from '../services';
import { LoadingSpinner } from '../components/UIStates';
import StatCard from '../components/StatCard';
import RiskBadge from '../components/RiskBadge';
import ActivityAgentDownloadCard from '../components/ActivityAgentDownloadCard';

export default function ManagerDashboard() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await employeeService.list({ limit: 100 });
        setTeam(data.items);
      } catch { toast.error('Failed to load team'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const counts = team.reduce((acc, e) => {
    const c = e.currentRiskCategory || 'Low';
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});
  const avg = team.length
    ? Math.round(team.reduce((s, e) => s + (e.currentRiskScore || 0), 0) / team.length)
    : 0;
  const sortedTeam = [...team].sort((a, b) => (b.currentRiskScore || 0) - (a.currentRiskScore || 0));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Manager View</p>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Team Dashboard</h1>
        <p className="text-sm text-ink-400 mt-1.5">Risk and engagement signals for your direct reports</p>
      </div>

      <ActivityAgentDownloadCard />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard tone="iris" label="Team size" value={team.length} sub="Direct reports" icon={Users} />
        <StatCard tone="cream" label="High risk" value={counts.High || 0} sub="Watch closely" icon={AlertTriangle} />
        <StatCard tone="rose" label="Critical risk" value={counts.Critical || 0} sub="Act this week" icon={AlertTriangle} />
        <StatCard tone="mint" label="Avg. risk" value={avg} sub="0-100 scale" icon={ClipboardList} />
      </div>

      <div className="glass overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h3 className="section-title">Your team</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Employee</th>
                <th className="table-th">Designation</th>
                <th className="table-th">Risk</th>
                <th className="table-th">Trend</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {sortedTeam.map((e) => (
                <tr key={e._id}>
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white"
                        style={{ background: 'linear-gradient(135deg, #8a98ff 0%, #4d52f5 100%)' }}>
                        {e.name?.[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-ink-100">{e.name}</span>
                    </div>
                  </td>
                  <td className="table-td">{e.designation || '-'}</td>
                  <td className="table-td"><RiskBadge category={e.currentRiskCategory} score={e.currentRiskScore} /></td>
                  <td className="table-td">{e.currentRiskTrend || 'Stable'}</td>
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
