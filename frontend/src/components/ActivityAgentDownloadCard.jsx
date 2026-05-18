import { Download, MonitorUp, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../services';
import { useAuthStore } from '../store/authStore';

const ALLOWED_ROLES = ['EMPLOYEE', 'MANAGER'];
export default function ActivityAgentDownloadCard() {
  const role = useAuthStore((s) => s.user?.role);
  if (!ALLOWED_ROLES.includes(role)) return null;

  const downloadInstaller = async () => {
    try {
      const { ticket } = await authService.agentInstallerTicket();
      window.location.href = authService.agentInstallerUrl(ticket);
      toast.success('Activity Agent download started');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not download Activity Agent');
    }
  };

  return (
    <div className="glass p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-400/15 border border-sky-400/30 flex items-center justify-center shrink-0">
            <MonitorUp size={18} className="text-sky-300" />
          </div>
          <div>
            <p className="font-semibold text-ink-100">RetainIQ Activity Agent</p>
            <p className="text-sm text-ink-400 mt-1.5">
              Install the Windows agent to track work sessions, breaks, app usage, and approved screenshots.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-ink-300">
              <ShieldCheck size={14} className="text-mint-300" />
              Available only to employee and manager accounts.
            </div>
          </div>
        </div>

        <button type="button" className="btn-primary shrink-0" onClick={downloadInstaller}>
          <Download size={16} />
          Download agent
        </button>
      </div>
    </div>
  );
}
