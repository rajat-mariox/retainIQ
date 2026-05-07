import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import { ArrowLeft, RefreshCw, Brain, Clock, Activity, Flame } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeService, productivityService, reportService } from '../services';
import { LoadingSpinner } from '../components/UIStates';
import ProductivityBadge from '../components/ProductivityBadge';
import { PRODUCTIVITY_COLORS } from '../utils/format';

export default function ProductivityDetail() {
  const { id } = useParams();
  const [employee, setEmployee] = useState(null);
  const [scores, setScores] = useState([]);
  const [pattern, setPattern] = useState(null);
  const [burnout, setBurnout] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalc, setRecalc] = useState(false);
  const [period, setPeriod] = useState('weekly');

  const load = async () => {
    setLoading(true);
    try {
      const [emp, sc, pat, bo, rep] = await Promise.all([
        employeeService.get(id),
        productivityService.scoresFor(id, 30).then((r) => r.items),
        productivityService.workPattern(id),
        productivityService.burnoutCheck(id),
        reportService.preview(id, period).catch(() => null),
      ]);
      setEmployee(emp); setScores(sc); setPattern(pat); setBurnout(bo); setReport(rep);
    } catch { toast.error('Failed to load productivity data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [id, period]);

  const recalcOne = async () => {
    setRecalc(true);
    try { await productivityService.calculate(id); toast.success('Productivity recalculated'); await load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Recalc failed'); }
    finally { setRecalc(false); }
  };

  if (loading || !employee) return <LoadingSpinner label="Loading workforce intelligence…" />;

  const latest = scores[scores.length - 1];
  const score = latest?.score ?? employee.currentProductivityScore ?? 0;
  const band = latest?.band || employee.currentProductivityBand || 'Stable';
  const bandColor = PRODUCTIVITY_COLORS[band] || PRODUCTIVITY_COLORS.Stable;

  const trendData = scores.map((s) => ({
    date: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    score: s.score,
  }));

  const subScoresData = latest?.subScores
    ? Object.entries(latest.subScores).filter(([k]) => k !== 'overall').map(([k, v]) => ({ name: k, value: v }))
    : [];

  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowData = (pattern?.dayOfWeekProfile || []).map((v, i) => ({ day: dowLabels[i], score: v }));

  const burnoutColor = burnout?.level === 'critical' ? 'rose' : burnout?.level === 'high' ? 'peach' : burnout?.level === 'moderate' ? 'cream' : 'mint';
  const burnoutHex = { rose: '#ff9bb0', peach: '#ffb18a', cream: '#ecdf9c', mint: '#7de4be' }[burnoutColor];

  return (
    <div className="space-y-5">
      <Link to={`/employees/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-200 transition">
        <ArrowLeft size={14} /> Back to employee
      </Link>

      {/* Header */}
      <div className="glass p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #8a98ff 0%, #4d52f5 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.20) inset, 0 12px 28px -8px rgba(77,82,245,0.55)' }}>
            {employee.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-0.5">Workforce Intelligence</p>
            <h1 className="text-2xl font-bold text-ink-100 tracking-tight">{employee.name}</h1>
            <p className="text-sm text-ink-400">{employee.designation}</p>
          </div>
        </div>
        <button onClick={recalcOne} disabled={recalc} className="btn-secondary">
          <RefreshCw size={14} className={recalc ? 'animate-spin' : ''} />
          {recalc ? 'Computing…' : "Compute today's score"}
        </button>
      </div>

      {/* Score + sub-scores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="glass p-5">
          <h3 className="section-title mb-2">Current productivity</h3>
          <div className="flex items-center justify-center my-2">
            <ResponsiveContainer width="100%" height={200}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%"
                data={[{ value: score, fill: bandColor.hex }]} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background={{ fill: 'rgba(255,255,255,0.04)' }} dataKey="value" cornerRadius={12} />
                <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontSize="34" fontWeight="700" fill="#dde1ee">{score}</text>
                <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#5b6691">/ 100</text>
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center"><ProductivityBadge band={band} /></div>
          {latest?.efficiency && (
            <p className="text-xs text-ink-400 text-center mt-3">
              Efficiency: <span className="text-ink-200">{latest.efficiency.tasksPerActiveHour} tasks/hr</span> ({latest.efficiency.normalized}/100)
            </p>
          )}
        </div>

        <div className="glass p-5 lg:col-span-2">
          <h3 className="section-title mb-4">Sub-scores</h3>
          {subScoresData.length === 0 ? (
            <p className="text-sm text-ink-400">No score data yet.</p>
          ) : (
            <div className="space-y-3">
              {subScoresData.map((s) => (
                <div key={s.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="capitalize text-ink-200">{s.name.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-medium text-ink-100">{s.value}/100</span>
                  </div>
                  <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${s.value}%`, background: s.value >= 70
                        ? 'linear-gradient(90deg, #7de4be, #4dd4a3)' : s.value >= 40
                        ? 'linear-gradient(90deg, #8a98ff, #4d52f5)' : 'linear-gradient(90deg, #ffb18a, #ff8e5b)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Burnout panel */}
      {burnout && (
        <div className="glass p-5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: burnoutHex }} />
          <div className="flex items-start gap-3 pl-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${burnoutHex}20`, border: `1px solid ${burnoutHex}40` }}>
              <Flame size={16} style={{ color: burnoutHex }} />
            </span>
            <div className="flex-1">
              <h3 className="section-title">
                Burnout signal: <span className="capitalize">{burnout.level === 'none' ? 'No concerns' : burnout.level}</span>
              </h3>
              {burnout.signals.length > 0 ? (
                <ul className="text-sm text-ink-300 mt-2 space-y-1">
                  {burnout.signals.map((s, i) => <li key={i} className="flex gap-2"><span className="text-ink-500">•</span> {s}</li>)}
                </ul>
              ) : <p className="text-sm text-ink-400 mt-1">Sustained patterns look healthy.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Trend */}
      {trendData.length > 1 && (
        <div className="glass p-5">
          <h3 className="section-title mb-4">30-day score trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#8a98ff" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#fff', stroke: '#4d52f5', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pattern */}
      {pattern && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="glass p-5">
            <h3 className="section-title mb-4 flex items-center gap-2"><Clock size={16} /> Day-of-week pattern</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dowData}>
                <defs>
                  <linearGradient id="dow-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8a98ff" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#4d52f5" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="score" fill="url(#dow-bar)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass p-5">
            <h3 className="section-title mb-4 flex items-center gap-2"><Activity size={16} /> Pattern summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Avg. daily score" value={`${pattern.avgDailyScore || 0}/100`} />
              <Stat label="Consistency" value={`${pattern.consistencyScore || 0}/100`} />
              <Stat label="Avg. active hours" value={`${pattern.avgActiveHours || 0}h`} />
              <Stat label="Avg. meeting hours" value={`${pattern.avgMeetingHours || 0}h`} />
              <Stat label="Avg. deep work" value={`${pattern.avgDeepWorkMinutes || 0} min`} />
              <Stat label="Best days" value={(pattern.bestDays || []).map((d) => dowLabels[d]).join(', ') || '—'} />
            </div>
          </div>
        </div>
      )}

      {/* AI Report */}
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title flex items-center gap-2"><Brain size={16} /> AI insights ({period})</h3>
          <select className="input max-w-[140px] py-1.5" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </div>
        {!report ? (
          <p className="text-sm text-ink-400">No report data available.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl p-4"
              style={{ background: 'linear-gradient(135deg, rgba(77,82,245,0.10), rgba(77,82,245,0.02))', border: '1px solid rgba(138,152,255,0.18)' }}>
              <p className="text-sm text-ink-100 leading-relaxed">{report.summary || 'Insufficient data to generate insight.'}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <KeyMetric label="Hours worked" value={`${report.metrics.hoursWorked}h`} />
              <KeyMetric label="Productive hours" value={`${report.metrics.productiveHours}h`} />
              <KeyMetric label="Tasks completed" value={report.metrics.tasksCompleted} />
            </div>
            {report.recommendations?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-ink-100 mb-2">Recommendations</p>
                <ul className="text-sm text-ink-300 space-y-1.5">
                  {report.recommendations.map((r, i) => <li key={i} className="flex gap-2"><span className="text-iris-400 mt-0.5">•</span> {r}</li>)}
                </ul>
              </div>
            )}
            <p className="text-xs text-amber-400/80 italic">
              Decision-support insights only — never the sole basis for employment decisions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="font-medium text-ink-100 mt-0.5">{value}</p>
    </div>
  );
}

function KeyMetric({ label, value }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="text-2xl font-bold text-ink-100 mt-0.5 tracking-tight">{value}</p>
    </div>
  );
}
