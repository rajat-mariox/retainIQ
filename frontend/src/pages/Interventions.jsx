import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { interventionService } from '../services';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import { formatDate } from '../utils/format';

const STATUS_TONES = {
  open:        { bg: 'bg-iris-400/15',  text: 'text-iris-300',  ring: 'border-iris-400/30' },
  in_progress: { bg: 'bg-cream-400/15', text: 'text-cream-300', ring: 'border-cream-400/30' },
  done:        { bg: 'bg-mint-400/15',  text: 'text-mint-300',  ring: 'border-mint-400/30' },
  cancelled:   { bg: 'bg-white/[0.05]', text: 'text-ink-400',   ring: 'border-white/10' },
};

export default function Interventions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = filter ? { status: filter } : {};
      const data = await interventionService.list(params);
      setItems(data.items);
    } catch { toast.error('Failed to load interventions'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [filter]);

  const updateStatus = async (id, status) => {
    try {
      await interventionService.update(id, { status });
      toast.success('Updated');
      load();
    } catch { toast.error('Update failed'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Interventions</h1>
        <p className="text-sm text-ink-400 mt-1.5">Track 1:1s, conversations, and corrective actions</p>
      </div>

      <div className="glass p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className="label">Status</label>
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No interventions" message="Open an employee detail page to log a 1:1 or other intervention." />
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Employee</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Owner</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Due</th>
                  <th className="table-th">Outcome</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const t = STATUS_TONES[i.status] || STATUS_TONES.open;
                  return (
                    <tr key={i._id}>
                      <td className="table-td">
                        <Link to={`/employees/${i.employeeId?._id}`} className="font-medium text-ink-100 hover:text-iris-200 transition">
                          {i.employeeId?.name || '—'}
                        </Link>
                      </td>
                      <td className="table-td">{i.type}</td>
                      <td className="table-td">{i.ownerId?.name || '—'}</td>
                      <td className="table-td">
                        <select
                          value={i.status}
                          onChange={(e) => updateStatus(i._id, e.target.value)}
                          className={`badge ${t.bg} ${t.text} ${t.ring} cursor-pointer outline-none`}
                          style={{ background: 'transparent' }}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td className="table-td muted">{formatDate(i.dueDate)}</td>
                      <td className="table-td">{i.outcome || '—'}</td>
                      <td className="table-td text-right">
                        <Link to={`/employees/${i.employeeId?._id}`} className="text-iris-300 text-sm font-medium hover:text-iris-200 inline-flex items-center gap-1 transition">
                          Open <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
