import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeService } from '../services';
import { EmptyState, LoadingSpinner } from '../components/UIStates';

export default function EmployeeActivityList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await employeeService.list({ limit: 200 });
        setItems(data.items || []);
      } catch {
        toast.error('Failed to load employees');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) =>
      [e.name, e.email, e.designation, e.departmentId?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Workforce Intelligence</p>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Employee Activity</h1>
        <p className="text-sm text-ink-400 mt-1.5">Select an employee to view their work sessions, app usage, and screenshots.</p>
      </div>

      <div className="glass p-4">
        <label className="label">Search</label>
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-10"
            placeholder="Name, email, designation, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading employees…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No employees found"
          message={search ? 'Try a different search term.' : 'Add employees to start tracking activity.'}
        />
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Employee</th>
                  <th className="table-th">Department</th>
                  <th className="table-th">Manager</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e._id}>
                    <td className="table-td">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #8a98ff 0%, #4d52f5 100%)' }}
                        >
                          {e.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-ink-100">{e.name}</div>
                          <div className="text-xs text-ink-400">{e.designation || e.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-td">{e.departmentId?.name || '—'}</td>
                    <td className="table-td">{e.reportingManagerId?.name || '—'}</td>
                    <td className="table-td text-right">
                      <Link
                        to={`/employee-activity/${e._id}`}
                        className="text-iris-300 text-sm font-medium hover:text-iris-200 inline-flex items-center gap-1 transition"
                      >
                        <Activity size={13} /> View activity <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
