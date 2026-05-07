import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import { ShieldCheck, Eye, EyeOff, Activity, Brain, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { productivityService, employeeService } from '../services';
import { LoadingSpinner } from '../components/UIStates';
import ProductivityBadge from '../components/ProductivityBadge';
import { useAuthStore } from '../store/authStore';
import { PRODUCTIVITY_COLORS } from '../utils/format';

export default function MyProductivity() {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const [me, setMe] = useState(null);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await employeeService.list({ search: user.email, limit: 1 });
        const emp = list.items[0];
        if (!emp) { setLoading(false); return; }
        setMe(emp);
        const sc = await productivityService.scoresFor(emp._id, 30);
        setScores(sc.items);
      } catch { toast.error('Failed to load your data'); }
      finally { setLoading(false); }
    })();
  }, [user.email]);

  if (loading) return <LoadingSpinner />;

  const transparencyEnabled = organization?.settings?.productivity?.transparencyEnabled !== false;
  const showScore = organization?.settings?.showRiskScoreToEmployees === true;

  const latest = scores[scores.length - 1];
  const score = latest?.score ?? me?.currentProductivityScore ?? 0;
  const band = latest?.band || me?.currentProductivityBand || 'Stable';
  const bandColor = PRODUCTIVITY_COLORS[band] || PRODUCTIVITY_COLORS.Stable;
  const trend = scores.map((s) => ({
    date: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    score: s.score,
  }));

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="glass p-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-3xl rotate-45"
          style={{ background: 'linear-gradient(135deg, rgba(138,152,255,0.20), rgba(77,82,245,0.04))', filter: 'blur(20px)' }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6470ff 0%, #4d52f5 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.20) inset' }}>
              <Activity size={18} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-ink-100 tracking-tight">Your productivity</h1>
          </div>
          <p className="text-sm text-ink-300 max-w-2xl">
            A personal view of your work patterns. We share aggregated trends with your manager — never raw activity, screen content, or messages.
          </p>
        </div>
      </div>

      {!me ? (
        <div className="glass p-8 text-center text-ink-400 text-sm">
          We couldn't find an employee profile linked to your account. Ask your HR admin to link them.
        </div>
      ) : showScore ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="glass p-5">
              <h3 className="section-title mb-2">Today's score</h3>
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
            </div>

            <div className="glass p-5 lg:col-span-2">
              <h3 className="section-title mb-4">30-day trend</h3>
              {trend.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#8a98ff" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-ink-400">Need a few more days of activity to show a trend.</p>
              )}
            </div>
          </div>

          {latest?.insights?.length > 0 && (
            <div className="glass p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><Brain size={16} /> Today's insights</h3>
              <ul className="space-y-1.5 text-sm text-ink-300">
                {latest.insights.map((i, idx) => <li key={idx} className="flex gap-2"><span className="text-iris-400">•</span> {i}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="glass p-5 flex items-start gap-3">
          <EyeOff size={20} className="text-ink-400 mt-0.5" />
          <div>
            <p className="font-medium text-ink-100">Numeric scores are hidden in your organization</p>
            <p className="text-sm text-ink-400 mt-1.5">
              Your organization has chosen not to display productivity scores to individuals. You can still review what data is collected below.
            </p>
          </div>
        </div>
      )}

      {/* Transparency panel */}
      {transparencyEnabled && (
        <div className="glass p-5">
          <h3 className="section-title mb-2 flex items-center gap-2">
            <ShieldCheck size={18} className="text-mint-300" /> What RetainIQ tracks (and what it doesn't)
          </h3>
          <div className="grid md:grid-cols-2 gap-5 mt-3">
            <div>
              <p className="text-sm font-medium text-mint-300 flex items-center gap-1.5 mb-2"><Eye size={14} /> What we use</p>
              <ul className="text-sm text-ink-300 space-y-1.5">
                <li className="flex gap-2"><span className="text-mint-400">•</span> Login/logout times from your HR system</li>
                <li className="flex gap-2"><span className="text-mint-400">•</span> Aggregated active vs idle time</li>
                <li className="flex gap-2"><span className="text-mint-400">•</span> App <em>category</em> usage (e.g. coding / docs / meeting), never app names</li>
                <li className="flex gap-2"><span className="text-mint-400">•</span> Tasks completed, commits, PRs from project tools</li>
                <li className="flex gap-2"><span className="text-mint-400">•</span> Calendar meeting durations</li>
                <li className="flex gap-2"><span className="text-mint-400">•</span> Optional self-reported pulse surveys</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-rose-300 flex items-center gap-1.5 mb-2"><EyeOff size={14} /> What we never collect</p>
              <ul className="text-sm text-ink-300 space-y-1.5">
                <li className="flex gap-2"><span className="text-rose-400">×</span> Screen recordings or screenshots</li>
                <li className="flex gap-2"><span className="text-rose-400">×</span> Keystroke logs</li>
                <li className="flex gap-2"><span className="text-rose-400">×</span> Email or chat message contents</li>
                <li className="flex gap-2"><span className="text-rose-400">×</span> Browsing URLs or window titles</li>
                <li className="flex gap-2"><span className="text-rose-400">×</span> Webcam or microphone</li>
                <li className="flex gap-2"><span className="text-rose-400">×</span> Clipboard contents</li>
              </ul>
            </div>
          </div>

          <div className="mt-5 p-4 rounded-xl flex items-start gap-2.5"
            style={{ background: 'linear-gradient(135deg, rgba(240,160,32,0.10), rgba(240,160,32,0.03))', border: '1px solid rgba(240,160,32,0.20)' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-400" />
            <p className="text-xs text-amber-300/90 leading-relaxed">
              Productivity scores are <strong>decision-support</strong> only — your manager and HR are required to consider context (workload, role, life events) and never use these scores as the sole basis for any employment decision.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
