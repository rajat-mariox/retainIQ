import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MessageSquare, TrendingUp, Heart, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { pulseService } from '../services';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import StatCard from '../components/StatCard';

export default function PulseInsights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setData(await pulseService.dashboard());
      } catch {
        toast.error('Failed to load pulse insights');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const averages = data?.averages;
  const trend = data?.monthlyTrend || [];
  const needsAttention = data?.needsAttention || [];
  const hasPulseData = averages?.sampleSize > 0;

  if (!hasPulseData) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Pulse Insights</h1>
        <EmptyState
          icon={MessageSquare}
          title="No pulse data yet"
          message="Once employees submit pulse surveys, aggregate insights will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Engagement</p>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Pulse Insights</h1>
        <p className="text-sm text-ink-400 mt-1.5">Anonymous mood, workload, support, and growth signals</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard tone="iris" label="Total responses" value={averages.sampleSize} sub="Last 90 days" icon={MessageSquare} />
        <StatCard tone="mint" label="Avg. mood" value={`${averages.mood ?? '-'}/5`} sub="Higher is better" icon={Heart} />
        <StatCard tone="sky" label="Avg. support" value={`${averages.managerSupport ?? '-'}/5`} sub="Higher is better" icon={TrendingUp} />
        <StatCard tone="cream" label="Avg. workload" value={`${averages.workload ?? '-'}/5`} sub="Higher is better" icon={Target} />
      </div>

      {trend.length > 1 && (
        <div className="glass p-5">
          <h3 className="section-title mb-4">Pulse trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <Tooltip />
              <Line type="monotone" dataKey="mood" stroke="#8fc7ff" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="workload" stroke="#ecdf9c" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="managerSupport" stroke="#7de4be" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="growth" stroke="#ff9bb0" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center justify-center gap-6 mt-3 text-xs">
            <span className="inline-flex items-center gap-2 text-ink-300"><span className="w-3 h-0.5 bg-sky-400 rounded-full" /> Mood</span>
            <span className="inline-flex items-center gap-2 text-ink-300"><span className="w-3 h-0.5 bg-cream-400 rounded-full" /> Workload</span>
            <span className="inline-flex items-center gap-2 text-ink-300"><span className="w-3 h-0.5 bg-mint-400 rounded-full" /> Support</span>
            <span className="inline-flex items-center gap-2 text-ink-300"><span className="w-3 h-0.5 bg-rose-400 rounded-full" /> Growth</span>
          </div>
        </div>
      )}

      {needsAttention.length > 0 && (
        <div className="glass p-5">
          <h3 className="section-title mb-4">Needs attention</h3>
          <div className="space-y-2">
            {needsAttention.map((item) => (
              <div key={item._id} className="text-sm text-ink-300 border-b border-white/[0.06] last:border-0 pb-2 last:pb-0">
                Mood {item.moodScore}/5, workload {item.workloadScore}/5, support {item.managerSupportScore}/5
                {item.requestHRCallback && (
                  <span className="badge ml-2 bg-rose-400/10 text-rose-300 border-rose-400/30">Callback requested</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-ink-500 italic">
        Pulse responses are aggregated and anonymized. RetainIQ never exposes individual responses to managers.
      </p>
    </div>
  );
}
