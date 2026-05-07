import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Flame, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import { productivityService } from '../services';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import ProductivityBadge from '../components/ProductivityBadge';

const RANK_TONES = {
  1: { bg: 'bg-cream-400/15', text: 'text-cream-300', ring: 'ring-cream-400/40' },
  2: { bg: 'bg-white/[0.06]', text: 'text-ink-200',   ring: 'ring-white/15' },
  3: { bg: 'bg-peach-400/15', text: 'text-peach-300', ring: 'ring-peach-400/40' },
};

export default function Leaderboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const d = await productivityService.leaderboard(); setItems(d.items); }
      catch { toast.error('Failed to load leaderboard'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Workforce Intelligence</p>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight flex items-center gap-3">
          <Trophy className="text-cream-400" size={28} /> Leaderboard
        </h1>
        <p className="text-sm text-ink-400 mt-1.5">Recognizing consistency and high performance</p>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Trophy} title="No leaderboard data yet" message="Productivity scores will appear here once activity logs are processed." />
      ) : (
        <div className="glass overflow-hidden">
          <ul className="divide-y divide-white/[0.04]">
            {items.map(({ rank, employee, streak, badges }) => {
              const tone = RANK_TONES[rank];
              return (
                <li key={employee._id} className="p-4 flex items-center gap-4 hover:bg-white/[0.02] transition">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold flex-shrink-0 ${
                    tone ? `${tone.bg} ${tone.text} ring-2 ${tone.ring}` : 'bg-white/[0.04] text-ink-400'
                  }`}>
                    {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link to={`/employees/${employee._id}`} className="font-medium text-ink-100 hover:text-iris-200 transition">{employee.name}</Link>
                    <p className="text-xs text-ink-400 truncate">{employee.designation} · {employee.departmentId?.name || '—'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {streak >= 3 && (
                        <span className="badge bg-peach-400/15 text-peach-300 border-peach-400/30 inline-flex items-center gap-1">
                          <Flame size={11} /> {streak}-day streak
                        </span>
                      )}
                      {badges.filter((b) => !['🥇', '🥈', '🥉'].includes(b) && !b.startsWith('Streak')).map((b) => (
                        <span key={b} className="badge bg-mint-400/15 text-mint-300 border-mint-400/30 inline-flex items-center gap-1">
                          <Award size={11} /> {b}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ProductivityBadge band={employee.currentProductivityBand} score={employee.currentProductivityScore} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-500 italic">
        Leaderboards exist to recognize effort. Low rankings are not penalties — every workload, role, and life situation is different.
      </p>
    </div>
  );
}
