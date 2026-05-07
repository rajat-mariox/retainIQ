import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Users, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeService, orgService } from '../services';
import RiskBadge from '../components/RiskBadge';
import { LoadingSpinner, EmptyState } from '../components/UIStates';
import Modal from '../components/Modal';
import { formatDate } from '../utils/format';
import { useAuthStore } from '../store/authStore';

const CAN_EDIT = ['ORG_ADMIN', 'HR_ADMIN'];

export default function EmployeeList() {
  const role = useAuthStore((s) => s.user?.role);
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ riskCategory: '', departmentId: '' });
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [data, dpts] = await Promise.all([
        employeeService.list({ search, ...filter, limit: 100 }),
        orgService.departments().catch(() => ({ items: [] })),
      ]);
      setItems(data.items);
      setDepartments(dpts.items || []);
    } catch { toast.error('Failed to load employees'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, []);

  const onSearch = (e) => { e.preventDefault(); load(); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Employees</h1>
          <p className="text-sm text-ink-400 mt-1.5">{items.length} {items.length === 1 ? 'person' : 'people'} visible to you</p>
        </div>
        {CAN_EDIT.includes(role) && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add employee
          </button>
        )}
      </div>

      <form onSubmit={onSearch} className="glass p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Search</label>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-10" placeholder="Name, email, role…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="min-w-[140px]">
          <label className="label">Risk</label>
          <select className="input" value={filter.riskCategory}
            onChange={(e) => setFilter({ ...filter, riskCategory: e.target.value })}>
            <option value="">All</option>
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="label">Department</label>
          <select className="input" value={filter.departmentId}
            onChange={(e) => setFilter({ ...filter, departmentId: e.target.value })}>
            <option value="">All</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Apply filters</button>
      </form>

      {loading ? <LoadingSpinner /> :
        items.length === 0 ? (
          <EmptyState icon={Users} title="No employees yet" message="Add your first employee to start tracking retention risk." />
        ) : (
          <div className="glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-th">Employee</th>
                    <th className="table-th">Department</th>
                    <th className="table-th">Manager</th>
                    <th className="table-th">Risk</th>
                    <th className="table-th">Trend</th>
                    <th className="table-th">Last updated</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => (
                    <tr key={e._id}>
                      <td className="table-td">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #8a98ff 0%, #4d52f5 100%)' }}>
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
                      <td className="table-td"><RiskBadge category={e.currentRiskCategory} score={e.currentRiskScore} /></td>
                      <td className="table-td">{e.currentRiskTrend || 'Stable'}</td>
                      <td className="table-td muted">{formatDate(e.currentRiskUpdatedAt)}</td>
                      <td className="table-td text-right">
                        <Link to={`/employees/${e._id}`} className="text-iris-300 text-sm font-medium hover:text-iris-200 inline-flex items-center gap-1 transition">
                          Open <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }

      <AddEmployeeModal open={showAdd} onClose={() => setShowAdd(false)} departments={departments} onCreated={load} />
    </div>
  );
}

function AddEmployeeModal({ open, onClose, departments, onCreated }) {
  const [form, setForm] = useState({
    name: '', email: '', designation: '', departmentId: '',
    employmentType: 'full_time', workMode: 'office', joiningDate: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await employeeService.create({ ...form, departmentId: form.departmentId || undefined });
      toast.success('Employee added');
      onClose(); onCreated();
      setForm({ name: '', email: '', designation: '', departmentId: '', employmentType: 'full_time', workMode: 'office', joiningDate: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add employee');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add employee" size="lg">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="col-span-2"><label className="label">Email</label>
          <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className="label">Designation</label>
          <input className="input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
        <div><label className="label">Department</label>
          <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">— Select —</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select></div>
        <div><label className="label">Employment type</label>
          <select className="input" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
            <option value="full_time">Full-time</option><option value="part_time">Part-time</option>
            <option value="contract">Contract</option><option value="intern">Intern</option>
          </select></div>
        <div><label className="label">Work mode</label>
          <select className="input" value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value })}>
            <option>office</option><option>hybrid</option><option>remote</option>
          </select></div>
        <div className="col-span-2"><label className="label">Joining date</label>
          <input className="input" type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} /></div>
        <div className="col-span-2 flex justify-end gap-2 mt-3 pt-3 border-t border-white/[0.06]">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Adding…' : 'Add employee'}</button>
        </div>
      </form>
    </Modal>
  );
}
