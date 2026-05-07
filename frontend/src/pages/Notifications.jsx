import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, ClipboardList, MessageSquare, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { notificationService } from '../services';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import { formatDate } from '../utils/format';

const ICONS = {
  critical_risk: AlertTriangle,
  intervention_due: ClipboardList,
  callback_request: MessageSquare,
  pulse_invite: MessageSquare,
};

const TONES = {
  high:   { bg: 'bg-rose-400/10',  text: 'text-rose-300',  border: 'border-rose-400/30' },
  medium: { bg: 'bg-peach-400/10', text: 'text-peach-300', border: 'border-peach-400/30' },
  low:    { bg: 'bg-iris-400/10',  text: 'text-iris-300',  border: 'border-iris-400/30' },
};

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const d = await notificationService.list(); setItems(d.items); }
    catch { toast.error('Failed to load notifications'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    try { await notificationService.markRead(id); load(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Notifications</h1>
        <p className="text-sm text-ink-400 mt-1.5">Critical-risk alerts, intervention reminders, and callback requests</p>
      </div>

      {loading ? <LoadingSpinner /> : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" message="You're all caught up." />
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            const tone = TONES[n.priority] || TONES.low;
            return (
              <div key={n._id} className={`glass p-4 flex items-start gap-3 ${!n.read ? 'ring-1 ring-iris-400/20' : ''}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tone.bg} border ${tone.border}`}>
                  <Icon size={18} className={tone.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="font-medium text-ink-100">{n.title}</p>
                    <span className="text-xs text-ink-400 flex-shrink-0">{formatDate(n.createdAt)}</span>
                  </div>
                  {n.message && <p className="text-sm text-ink-300 mt-1">{n.message}</p>}
                </div>
                {!n.read && (
                  <button onClick={() => markRead(n._id)} className="text-mint-300 text-sm font-medium hover:text-mint-200 inline-flex items-center gap-1 transition flex-shrink-0">
                    <CheckCircle2 size={14} /> Mark read
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
