import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, MessageSquare } from 'lucide-react';
import { pulseService } from '../services';

export default function PulseQuestionsAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ label: '', lowLabel: 'Low', highLabel: 'High' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await pulseService.questions(false);
      setItems(data.items || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await pulseService.createQuestion({
        label: form.label.trim(),
        lowLabel: form.lowLabel.trim() || 'Low',
        highLabel: form.highLabel.trim() || 'High',
      });
      setForm({ label: '', lowLabel: 'Low', highLabel: 'High' });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add question');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (q) => {
    try {
      await pulseService.updateQuestion(q._id, { isActive: !q.isActive });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const move = async (q, direction) => {
    const idx = items.findIndex((i) => i._id === q._id);
    const swapWith = direction === 'up' ? items[idx - 1] : items[idx + 1];
    if (!swapWith) return;
    try {
      await Promise.all([
        pulseService.updateQuestion(q._id, { order: swapWith.order }),
        pulseService.updateQuestion(swapWith._id, { order: q.order }),
      ]);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reorder failed');
    }
  };

  const remove = async (q) => {
    if (!window.confirm(`Delete "${q.label}"? Historical responses keep the question label on record.`)) return;
    try {
      await pulseService.deleteQuestion(q._id);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Engagement</p>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Pulse questions</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          Add extra rating questions (1–5) that employees see after the four standard ones.
          The standard mood/workload/support/growth questions stay fixed.
        </p>
      </div>

      <div className="glass p-5">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Question</label>
            <input
              className="input"
              placeholder="e.g. Do you have the tools you need to do your job well?"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              maxLength={300}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Low end label</label>
              <input
                className="input"
                value={form.lowLabel}
                onChange={(e) => setForm({ ...form, lowLabel: e.target.value })}
                maxLength={40}
              />
            </div>
            <div>
              <label className="label">High end label</label>
              <input
                className="input"
                value={form.highLabel}
                onChange={(e) => setForm({ ...form, highLabel: e.target.value })}
                maxLength={40}
              />
            </div>
          </div>
          <button className="btn-primary flex items-center gap-2" disabled={saving}>
            <Plus size={14} /> {saving ? 'Adding…' : 'Add question'}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400 px-1">Loading…</p>
      ) : items.length === 0 ? (
        <div className="glass p-8 text-center">
          <MessageSquare className="mx-auto text-ink-500 mb-3" size={28} />
          <p className="text-sm text-ink-300">No custom questions yet. Add the first one above.</p>
        </div>
      ) : (
        <div className="glass p-5">
          <h2 className="text-sm font-semibold text-ink-200 uppercase tracking-wider mb-3">Questions ({items.length})</h2>
          <ul className="space-y-2">
            {items.map((q, idx) => (
              <li
                key={q._id}
                className={`px-3 py-3 rounded-xl border border-white/[0.06] ${
                  q.isActive ? 'bg-white/[0.04]' : 'bg-white/[0.02] opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => move(q, 'up')}
                      disabled={idx === 0}
                      className="text-ink-400 hover:text-ink-200 disabled:opacity-30 transition"
                      title="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => move(q, 'down')}
                      disabled={idx === items.length - 1}
                      className="text-ink-400 hover:text-ink-200 disabled:opacity-30 transition"
                      title="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-100">{q.label}</p>
                    <p className="text-[11px] text-ink-400 mt-1">
                      1 = <span className="text-ink-300">{q.lowLabel}</span>{' '}
                      … 5 = <span className="text-ink-300">{q.highLabel}</span>
                      {!q.isActive && <span className="ml-2 text-rose-300">Hidden</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(q)}
                      className="p-1.5 rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-ink-200 transition"
                      title={q.isActive ? 'Hide from employees' : 'Show to employees'}
                    >
                      {q.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    <button
                      onClick={() => remove(q)}
                      className="p-1.5 rounded-lg text-ink-400 hover:bg-rose-400/10 hover:text-rose-300 transition"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-500 italic">
        Hiding a question keeps existing responses intact but removes it from the survey form. Deleting it preserves historical responses (labels are snapshotted on submit).
      </p>
    </div>
  );
}
