import { useEffect, useState } from 'react';
import { FileText, Plus, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { reportService, employeeService, orgService } from '../services';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import Modal from '../components/Modal';
import { formatDate } from '../utils/format';

export default function Reports() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGen, setShowGen] = useState(false);
  const [filter, setFilter] = useState({ scope: '', period: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.scope) params.scope = filter.scope;
      if (filter.period) params.period = filter.period;
      const d = await reportService.list(params);
      setItems(d.items);
    } catch { toast.error('Failed to load reports'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [filter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Reports</h1>
          <p className="text-sm text-ink-400 mt-1.5">Daily, weekly, and monthly productivity reports</p>
        </div>
        <button className="btn-primary" onClick={() => setShowGen(true)}><Plus size={16} /> Generate report</button>
      </div>

      <div className="glass p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[140px]">
          <label className="label">Scope</label>
          <select className="input" value={filter.scope} onChange={(e) => setFilter({ ...filter, scope: e.target.value })}>
            <option value="">All</option>
            <option value="employee">Employee</option><option value="team">Team</option><option value="company">Company</option>
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="label">Period</label>
          <select className="input" value={filter.period} onChange={(e) => setFilter({ ...filter, period: e.target.value })}>
            <option value="">All</option>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : items.length === 0 ? (
        <EmptyState icon={FileText} title="No reports yet" message="Generate your first report — daily, weekly, or monthly." />
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <div key={r._id} className="glass p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-ink-100 capitalize text-base">
                    {r.scope} · {r.period}
                    {r.employeeId?.name && ` · ${r.employeeId.name}`}
                  </p>
                  <p className="text-xs text-ink-400 mt-1.5 flex items-center gap-1.5">
                    <Calendar size={12} /> {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                  </p>
                </div>
                <span className="badge bg-white/[0.05] text-ink-300 border-white/10">{r.aiSource}</span>
              </div>
              {r.summary && <p className="text-sm text-ink-200 mt-4 leading-relaxed">{r.summary}</p>}
              {r.recommendations?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                  <p className="text-xs font-medium text-ink-200 mb-2 uppercase tracking-wider">Recommendations</p>
                  <ul className="text-sm text-ink-300 space-y-1.5">
                    {r.recommendations.slice(0, 3).map((rec, i) => (
                      <li key={i} className="flex gap-2"><span className="text-iris-400">•</span> {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <GenerateReportModal open={showGen} onClose={() => setShowGen(false)} onCreated={load} />
    </div>
  );
}

function GenerateReportModal({ open, onClose, onCreated }) {
  const [scope, setScope] = useState('employee');
  const [period, setPeriod] = useState('weekly');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    employeeService.list({ limit: 200 }).then((d) => setEmployees(d.items)).catch(() => {});
    orgService.departments().then((d) => setDepartments(d.items || [])).catch(() => {});
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { scope, period };
      if (scope === 'employee') payload.employeeId = employeeId;
      if (scope === 'team') payload.departmentId = departmentId || undefined;
      await reportService.generate(payload);
      toast.success('Report generated');
      onClose(); onCreated();
    } catch (err) { toast.error(err.response?.data?.error || 'Generate failed'); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Generate report">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Scope</label>
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="employee">Employee</option><option value="team">Team</option><option value="company">Company</option>
          </select>
        </div>
        <div>
          <label className="label">Period</label>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </div>
        {scope === 'employee' && (
          <div>
            <label className="label">Employee</label>
            <select className="input" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">— Select —</option>
              {employees.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </div>
        )}
        {scope === 'team' && (
          <div>
            <label className="label">Department (optional)</label>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Generating…' : 'Generate'}</button>
        </div>
      </form>
    </Modal>
  );
}
