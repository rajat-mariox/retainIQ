import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckSquare, Square, Trash2, Plus, CalendarClock } from 'lucide-react';
import { taskService } from '../services';

function formatDue(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function isOverdue(task) {
  return task.status === 'pending' && task.dueDate && new Date(task.dueDate) < new Date();
}

export default function EmployeeTasks() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, completed: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', dueDate: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await taskService.list();
      setItems(data.items || []);
      setCounts(data.counts || { pending: 0, completed: 0, overdue: 0 });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await taskService.create({
        title: form.title.trim(),
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      });
      setForm({ title: '', dueDate: '' });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add task');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (task) => {
    try {
      await taskService.update(task._id, {
        status: task.status === 'completed' ? 'pending' : 'completed',
      });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const remove = async (task) => {
    try {
      await taskService.remove(task._id);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const pending = items.filter((t) => t.status === 'pending');
  const completed = items.filter((t) => t.status === 'completed');

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="glass p-6">
        <h1 className="text-2xl font-bold text-ink-100 tracking-tight mb-1.5">My tasks</h1>
        <p className="text-sm text-ink-400 mb-5">
          Log what you are working on. Completed tasks feed into your daily productivity score.
        </p>

        <form onSubmit={submit} className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Task</label>
            <input
              className="input"
              placeholder="What are you working on?"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={200}
              required
            />
          </div>
          <div>
            <label className="label">Due (optional)</label>
            <input
              className="input"
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </div>
          <button className="btn-primary flex items-center gap-2" disabled={saving}>
            <Plus size={14} /> {saving ? 'Adding…' : 'Add'}
          </button>
        </form>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <Stat label="Pending" value={counts.pending} tone="iris" />
          <Stat label="Overdue" value={counts.overdue} tone="rose" />
          <Stat label="Completed" value={counts.completed} tone="mint" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400 px-1">Loading…</p>
      ) : (
        <>
          <TaskList
            title="Open"
            emptyHint="No open tasks. Add one above."
            tasks={pending}
            onToggle={toggle}
            onDelete={remove}
          />
          <TaskList
            title="Completed"
            emptyHint="Nothing completed yet."
            tasks={completed}
            onToggle={toggle}
            onDelete={remove}
            muted
          />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const toneClass = {
    iris: 'text-iris-300 border-iris-400/30 bg-iris-400/10',
    rose: 'text-rose-300 border-rose-400/30 bg-rose-400/10',
    mint: 'text-mint-300 border-mint-400/30 bg-mint-400/10',
  }[tone] || 'text-ink-200 border-white/10 bg-white/[0.04]';
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function TaskList({ title, tasks, emptyHint, onToggle, onDelete, muted }) {
  return (
    <div className="glass p-5">
      <h2 className="text-sm font-semibold text-ink-200 uppercase tracking-wider mb-3">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-400">{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t._id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.06] ${
                muted ? 'bg-white/[0.02]' : 'bg-white/[0.04] hover:bg-white/[0.06]'
              } transition`}
            >
              <button
                onClick={() => onToggle(t)}
                className="text-iris-300 hover:text-iris-200 transition flex-shrink-0"
                title={t.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
              >
                {t.status === 'completed' ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${t.status === 'completed' ? 'line-through text-ink-400' : 'text-ink-100'}`}>
                  {t.title}
                </p>
                {t.dueDate && (
                  <p
                    className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                      isOverdue(t) ? 'text-rose-300' : 'text-ink-400'
                    }`}
                  >
                    <CalendarClock size={11} />
                    {formatDue(t.dueDate)}
                    {isOverdue(t) && <span className="ml-1 font-medium">Overdue</span>}
                  </p>
                )}
              </div>
              <button
                onClick={() => onDelete(t)}
                className="text-ink-500 hover:text-rose-300 transition flex-shrink-0 p-1"
                title="Delete task"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
