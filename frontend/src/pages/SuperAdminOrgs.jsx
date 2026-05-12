import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Power, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { orgService } from '../services';
import { LoadingSpinner } from '../components/UIStates';
import { formatDate } from '../utils/format';

export default function SuperAdminOrgs() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const rows = items.map((item) => {
    const organization = item.organization || item;
    const plan = item.plan?.plan || organization.plan || 'trial';

    return {
      ...organization,
      plan,
      users: item.users,
      employees: item.employees,
      isActive: organization.isActive !== false,
      approvalStatus: organization.approvalStatus || 'approved',
    };
  });

  const load = async () => {
    setLoading(true);
    try {
      const d = await orgService.listAll();
      setItems(d.items || []);
    } catch {
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id) => {
    try {
      await orgService.toggleActive(id);
      toast.success('Updated');
      load();
    } catch {
      toast.error('Failed');
    }
  };

  const approve = async (id) => {
    try {
      await orgService.approve(id);
      toast.success('Organization approved');
      load();
    } catch {
      toast.error('Approval failed');
    }
  };

  const reject = async (id) => {
    try {
      await orgService.reject(id);
      toast.success('Organization rejected');
      load();
    } catch {
      toast.error('Rejection failed');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Super Admin</p>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Organizations</h1>
        <p className="text-sm text-ink-400 mt-1.5">All tenants on the RetainIQ platform</p>
      </div>

      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Industry</th>
                <th className="table-th">Plan</th>
                <th className="table-th">Users</th>
                <th className="table-th">Employees</th>
                <th className="table-th">Status</th>
                <th className="table-th">Created</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o._id}>
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg, rgba(138,152,255,0.20), rgba(77,82,245,0.05))',
                          border: '1px solid rgba(138,152,255,0.20)',
                        }}
                      >
                        <Building2 size={16} className="text-iris-300" />
                      </div>
                      <div>
                        <div className="font-medium text-ink-100">{o.name}</div>
                        <div className="text-xs text-ink-400">{o.domain || '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">{o.industry || '-'}</td>
                  <td className="table-td">
                    <span className="badge bg-iris-400/15 text-iris-300 border-iris-400/30 capitalize">{o.plan}</span>
                  </td>
                  <td className="table-td">{o.users ?? '-'}</td>
                  <td className="table-td">{o.employees ?? '-'}</td>
                  <td className="table-td">
                    {o.approvalStatus === 'pending'
                      ? <span className="badge bg-amber-400/15 text-amber-300 border-amber-400/30">Pending approval</span>
                      : o.approvalStatus === 'rejected'
                        ? <span className="badge bg-rose-400/15 text-rose-300 border-rose-400/30">Rejected</span>
                        : o.isActive
                          ? <span className="badge bg-mint-400/15 text-mint-300 border-mint-400/30">Active</span>
                          : <span className="badge bg-white/[0.05] text-ink-400 border-white/10">Suspended</span>}
                  </td>
                  <td className="table-td muted">{formatDate(o.createdAt)}</td>
                  <td className="table-td text-right">
                    <div className="flex justify-end gap-3">
                      {o.approvalStatus === 'pending' && (
                        <>
                          <button onClick={() => approve(o._id)} className="text-mint-300 text-sm font-medium hover:text-mint-200 inline-flex items-center gap-1 transition">
                            <CheckCircle2 size={12} /> Approve
                          </button>
                          <button onClick={() => reject(o._id)} className="text-rose-300 text-sm font-medium hover:text-rose-200 inline-flex items-center gap-1 transition">
                            <XCircle size={12} /> Reject
                          </button>
                        </>
                      )}
                      {o.approvalStatus === 'approved' && (
                        <button onClick={() => toggle(o._id)} className="text-ink-300 text-sm font-medium hover:text-ink-100 inline-flex items-center gap-1 transition">
                          <Power size={12} /> {o.isActive ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="table-td text-center text-ink-400" colSpan={8}>
                    No organizations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
