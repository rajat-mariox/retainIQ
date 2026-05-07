import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, Flame, TrendingDown, Calendar, Coffee, Award, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { alertService } from '../services';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import { formatDate } from '../utils/format';

const ICONS = {
  burnout_risk: Flame, productivity_drop: TrendingDown, overwork: Flame,
  high_idle: Coffee, low_focus: AlertOctagon, meeting_overload: Calendar,
  high_performer: Award, consistency_streak: Award,
};

const TONES = {
  critical: { bg: 'bg-rose-400/10',  text: 'text-rose-300',  border: 'border-rose-400/30' },
  warning:  { bg: 'bg-peach-400/10', text: 'text-peach-300', border: 'border-peach-400/30' },
  info:     { bg: 'bg-iris-400/10',  text: 'text-iris-300',  border: 'border-iris-400/30' },
};

export default function Alerts() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ type: '', acknowledged: 'false' });

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.type) params.type = filter.type;
      if (filter.acknowledged !== '') params.acknowledged = filter.acknowledged;
      const d = await alertService.list(params);
      setItems(d.items);
    } catch { toast.error('Failed to load alerts'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [filter]);

  const ack = async (id) => {
    try { await alertService.acknowledge(id); toast.success('Acknowledged'); load(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Workforce Intelligence</p>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Workforce Alerts</h1>
        <p className="text-sm text-ink-400 mt-1.5">Burnout, productivity drops, meeting overload, and recognition signals</p>
      </div>

      <div className="glass p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="label">Type</label>
          <select className="input" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
            <option value="">All</option>
            <option value="burnout_risk">Burnout risk</option>
            <option value="productivity_drop">Productivity drop</option>
            <option value="meeting_overload">Meeting overload</option>
            <option value="high_idle">High idle</option>
            <option value="low_focus">Low focus</option>
            <option value="overwork">Overwork</option>
            <option value="high_performer">High performer</option>
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="label">Status</label>
          <select className="input" value={filter.acknowledged} onChange={(e) => setFilter({ ...filter, acknowledged: e.target.value })}>
            <option value="false">Unacknowledged</option>
            <option value="true">Acknowledged</option>
            <option value="">All</option>
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : items.length === 0 ? (
        <EmptyState icon={AlertOctagon} title="No alerts" message="No signals match your current filter." />
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const Icon = ICONS[a.type] || AlertOctagon;
            const tone = TONES[a.severity] || TONES.info;
            return (
              <div key={a._id} className="glass p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tone.bg} border ${tone.border}`}>
                  <Icon size={18} className={tone.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="font-medium text-ink-100">{a.title}</p>
                    <span className="text-xs text-ink-400 flex-shrink-0">{formatDate(a.triggeredAt)}</span>
                  </div>
                  <p className="text-sm text-ink-300 mt-1">{a.message}</p>
                  {a.employeeId && (
                    <Link to={`/employees/${a.employeeId._id}/productivity`} className="text-xs text-iris-300 font-medium hover:text-iris-200 mt-1.5 inline-block transition">
                      View {a.employeeId.name}'s productivity →
                    </Link>
                  )}
                  {a.acknowledged && (
                    <p className="text-xs text-ink-500 mt-1.5">
                      Acknowledged by {a.acknowledgedBy?.name || 'someone'} on {formatDate(a.acknowledgedAt)}
                    </p>
                  )}
                </div>
                {!a.acknowledged && (
                  <button onClick={() => ack(a._id)} className="text-mint-300 text-sm font-medium hover:text-mint-200 inline-flex items-center gap-1 transition flex-shrink-0">
                    <CheckCircle2 size={14} /> Acknowledge
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
