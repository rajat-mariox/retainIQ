import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { roiService } from '../services';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import StatCard from '../components/StatCard';
import { formatNumber } from '../utils/format';

const BAND_COLORS = {
  'Strong Positive': { bg: 'bg-mint-400/15',  text: 'text-mint-300',  ring: 'border-mint-400/30' },
  'Positive':        { bg: 'bg-iris-400/15',  text: 'text-iris-300',  ring: 'border-iris-400/30' },
  'Neutral':         { bg: 'bg-white/[0.05]', text: 'text-ink-300',   ring: 'border-white/10' },
  'Negative':        { bg: 'bg-peach-400/15', text: 'text-peach-300', ring: 'border-peach-400/30' },
};

export default function ROIDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('monthly');

  const load = async () => {
    setLoading(true);
    try { setData(await roiService.dashboard(period)); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to load ROI'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [period]);

  if (loading) return <LoadingSpinner label="Loading ROI dashboard…" />;

  if (data && !data.enabled) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Employee ROI</h1>
        <EmptyState icon={DollarSign} title="ROI tracking is disabled"
          message="Enable ROI tracking in Settings → Workforce Intelligence. You'll also need to set monthly cost on each employee."
          action={<Link to="/settings" className="btn-primary">Open Settings</Link>} />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Employee ROI</h1>
        <EmptyState icon={DollarSign} title="No ROI data yet" message="Set monthly cost on at least one employee to compute ROI." />
      </div>
    );
  }

  const currency = data.items[0]?.inputs?.currency || 'USD';
  const sortedItems = [...data.items].sort((a, b) => b.roiRatio - a.roiRatio);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Workforce Intelligence</p>
          <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Employee ROI</h1>
          <p className="text-sm text-ink-400 mt-1.5">Cost vs. estimated output value · {data.period}</p>
        </div>
        <select className="input max-w-[180px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="weekly">Last 7 days</option>
          <option value="monthly">Last 30 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard tone="iris"  label="Total cost"           value={formatNumber(data.totals.totalCost, currency)} sub="Total spend in period" icon={DollarSign} />
        <StatCard tone="sky"   label="Output value"          value={formatNumber(data.totals.totalValue, currency)} sub="Estimated worth" icon={BarChart3} />
        <StatCard tone={data.totals.totalNet >= 0 ? 'mint' : 'peach'} label="Net value"
          value={formatNumber(data.totals.totalNet, currency)} sub={data.totals.totalNet >= 0 ? 'In the green' : 'Underwater'}
          icon={data.totals.totalNet >= 0 ? TrendingUp : TrendingDown} />
        <StatCard tone="cream" label="Company ROI" value={`${data.totals.companyROI}×`} sub="output / cost" />
      </div>

      <div className="glass overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h3 className="section-title">Per-employee ROI</h3>
          <p className="text-xs text-ink-400 mt-1.5">
            Coarse trend signal — based on productivity score × productive hours × role-value benchmark. Use for spotting outliers, not for compensation decisions.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Employee</th>
                <th className="table-th">Cost</th>
                <th className="table-th">Output value</th>
                <th className="table-th">Net</th>
                <th className="table-th">Ratio</th>
                <th className="table-th">Avg. productivity</th>
                <th className="table-th">Band</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((x) => {
                const c = BAND_COLORS[x.band] || BAND_COLORS.Neutral;
                return (
                  <tr key={x.employee._id}>
                    <td className="table-td">
                      <Link to={`/employees/${x.employee._id}`} className="font-medium text-ink-100 hover:text-iris-200 transition">{x.employee.name}</Link>
                      <div className="text-xs text-ink-400">{x.employee.designation}</div>
                    </td>
                    <td className="table-td">{formatNumber(x.monthlyCost, currency)}</td>
                    <td className="table-td">{formatNumber(x.estimatedOutputValue, currency)}</td>
                    <td className={`table-td font-medium ${x.netValue >= 0 ? 'text-mint-300' : 'text-peach-300'}`}>
                      {formatNumber(x.netValue, currency)}
                    </td>
                    <td className="table-td font-medium text-ink-100">{x.roiRatio}×</td>
                    <td className="table-td">{x.inputs?.avgProductivityScore ?? '—'}/100</td>
                    <td className="table-td"><span className={`badge ${c.bg} ${c.text} ${c.ring}`}>{x.band}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
