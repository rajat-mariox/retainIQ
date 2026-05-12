import { useEffect, useState } from 'react';
import { Plus, Activity, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsService, orgService, userService, employeeService, activityService } from '../services';
import { LoadingSpinner } from '../components/UIStates';
import { useAuthStore } from '../store/authStore';

export default function Settings() {
  const role = useAuthStore((s) => s.user?.role);
  const [settings, setSettings] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newDept, setNewDept] = useState('');
  const [newUser, setNewUser] = useState({
    name: '', email: '', password: '', role: 'HR_ADMIN',
    departmentId: '', designation: '', joiningDate: '', workMode: 'office',
  });
  const riskWeights = settings?.riskWeights || {};

  const load = async () => {
    setLoading(true);
    try {
      const [s, d, emps] = await Promise.all([
        settingsService.get(),
        orgService.departments(),
        employeeService.list({ limit: 200 }).catch(() => ({ items: [] })),
      ]);
      setSettings(s.settings);
      setDepartments(d.items || []);
      setEmployees(emps.items || []);
      if (role === 'ORG_ADMIN') {
        const users = await userService.list().catch(() => ({ items: [] }));
        setOrgUsers(users.items || []);
      }
    } catch { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateWeight = (key, value) => {
    const v = parseFloat(value);
    if (Number.isNaN(v)) return;
    setSettings({ ...settings, riskWeights: { ...settings.riskWeights, [key]: v } });
  };

  const updateProdWeight = (key, value) => {
    const v = parseFloat(value);
    if (Number.isNaN(v)) return;
    setSettings({
      ...settings,
      productivity: {
        ...settings.productivity,
        weights: { ...settings.productivity.weights, [key]: v },
      },
    });
  };

  const [savingAgent, setSavingAgent] = useState(false);
  const saveAgentSettings = async () => {
    const v = parseInt(settings.agent?.screenshotIntervalMinutes, 10);
    const interval = Number.isFinite(v) ? Math.max(1, Math.min(240, v)) : 10;
    setSavingAgent(true);
    try {
      const res = await settingsService.update({
        agent: {
          screenshotIntervalMinutes: interval,
          screenshotsEnabled: settings.agent?.screenshotsEnabled !== false,
        },
      });
      setSettings({ ...settings, agent: res.settings.agent });
      toast.success('Tracker settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSavingAgent(false);
    }
  };

  const sumOfWeights = Object.values(riskWeights).reduce((a, b) => a + b, 0);
  const sumOfProdWeights = settings?.productivity?.weights
    ? Object.values(settings.productivity.weights).reduce((a, b) => a + b, 0)
    : 1;

  const save = async () => {
    if (Math.abs(sumOfWeights - 1) > 0.01) {
      toast.error('Risk weights must sum to 1.0'); return;
    }
    if (settings.productivity?.weights && Math.abs(sumOfProdWeights - 1) > 0.01) {
      toast.error('Productivity weights must sum to 1.0'); return;
    }
    setSaving(true);
    try {
      await settingsService.update({
        riskWeights: settings.riskWeights,
        showRiskScoreToEmployees: settings.showRiskScoreToEmployees,
        pulseSurveyFrequencyDays: settings.pulseSurveyFrequencyDays,
        notificationPreferences: settings.notificationPreferences,
        productivity: settings.productivity,
        agent: settings.agent,
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const addDept = async (e) => {
    e.preventDefault();
    if (!newDept.trim()) return;
    try {
      await orgService.createDepartment({ name: newDept.trim() });
      setNewDept('');
      toast.success('Department added');
      load();
    } catch { toast.error('Failed to add'); }
  };

  const addOrgUser = async (e) => {
    e.preventDefault();
    try {
      await userService.create({
        ...newUser,
        departmentId: newUser.role === 'MANAGER' && newUser.departmentId ? newUser.departmentId : undefined,
        designation: newUser.role === 'MANAGER' ? newUser.designation || 'Manager' : undefined,
        joiningDate: newUser.role === 'MANAGER' ? newUser.joiningDate || undefined : undefined,
        workMode: newUser.role === 'MANAGER' ? newUser.workMode : undefined,
      });
      toast.success(newUser.role === 'MANAGER' ? 'Manager added' : 'HR admin added');
      setNewUser({ name: '', email: '', password: '', role: 'HR_ADMIN', departmentId: '', designation: '', joiningDate: '', workMode: 'office' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add user');
    }
  };

  if (loading || !settings) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink-100 tracking-tight">Settings</h1>
          <p className="text-sm text-ink-400 mt-1.5">Configure risk scoring, productivity engine, and departments</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>
      </div>

      {/* Risk weights */}
      <div className="glass p-5">
        <h3 className="section-title mb-4">Risk-score weights</h3>
        <p className="text-sm text-ink-400 mb-4">Tune how much each component contributes to the overall risk score. Weights must sum to 1.0.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(riskWeights).map(([k, v]) => (
            <div key={k}>
              <label className="label capitalize">{k.replace(/_/g, ' ')}</label>
              <input type="number" step="0.05" min="0" max="1" className="input"
                value={v} onChange={(e) => updateWeight(k, e.target.value)} />
            </div>
          ))}
        </div>
        <p className={`text-sm mt-3 ${Math.abs(sumOfWeights - 1) > 0.01 ? 'text-rose-300' : 'text-ink-400'}`}>
          Total: {sumOfWeights.toFixed(2)} {Math.abs(sumOfWeights - 1) > 0.01 ? '(must equal 1.0)' : '✓'}
        </p>
      </div>

      {/* Productivity */}
      <div className="glass p-5">
        <h3 className="section-title mb-2">Workforce Intelligence</h3>
        <p className="text-sm text-ink-400 mb-4">Configure productivity scoring, burnout detection, and ROI tracking.</p>

        {settings.productivity?.weights && (
          <>
            <p className="text-sm font-medium text-ink-200 mb-2">Productivity sub-score weights</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              {Object.entries(settings.productivity.weights).map(([k, v]) => (
                <div key={k}>
                  <label className="label capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</label>
                  <input type="number" step="0.05" min="0" max="1" className="input"
                    value={v} onChange={(e) => updateProdWeight(k, e.target.value)} />
                </div>
              ))}
            </div>
            <p className={`text-sm mb-4 ${Math.abs(sumOfProdWeights - 1) > 0.01 ? 'text-rose-300' : 'text-ink-400'}`}>
              Total: {sumOfProdWeights.toFixed(2)} {Math.abs(sumOfProdWeights - 1) > 0.01 ? '(must equal 1.0)' : '✓'}
            </p>
          </>
        )}

        {settings.productivity?.burnout && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="label">Healthy daily hours (max)</label>
              <input type="number" min="1" max="24" className="input"
                value={settings.productivity.burnout.maxHealthyDailyHours}
                onChange={(e) => setSettings({
                  ...settings,
                  productivity: { ...settings.productivity, burnout: { ...settings.productivity.burnout, maxHealthyDailyHours: parseInt(e.target.value) || 9 } },
                })} />
            </div>
            <div>
              <label className="label">Consecutive overwork days threshold</label>
              <input type="number" min="1" max="30" className="input"
                value={settings.productivity.burnout.consecutiveOverworkDays}
                onChange={(e) => setSettings({
                  ...settings,
                  productivity: { ...settings.productivity, burnout: { ...settings.productivity.burnout, consecutiveOverworkDays: parseInt(e.target.value) || 5 } },
                })} />
            </div>
          </div>
        )}

        <div className="space-y-3 mt-4 pt-4 border-t border-white/[0.06]">
          <SettingToggle
            checked={!!settings.productivity?.roiEnabled}
            onChange={(b) => setSettings({ ...settings, productivity: { ...settings.productivity, roiEnabled: b } })}
            title="Enable Employee ROI tracking"
            sub="Requires monthly cost on each employee. ROI is a coarse signal — never use as the sole basis for compensation or termination decisions."
          />
          <SettingToggle
            checked={settings.productivity?.gamificationEnabled !== false}
            onChange={(b) => setSettings({ ...settings, productivity: { ...settings.productivity, gamificationEnabled: b } })}
            title="Enable leaderboard & badges"
            sub="Public recognition for high performers and consistency streaks."
          />
          <SettingToggle
            checked={settings.productivity?.transparencyEnabled !== false}
            onChange={(b) => setSettings({ ...settings, productivity: { ...settings.productivity, transparencyEnabled: b } })}
            title='Show "what we track" panel to employees'
            sub="Recommended for trust and compliance."
          />
        </div>
      </div>

      {/* Visibility & Pulse */}
      <div className="glass p-5">
        <h3 className="section-title mb-4">Visibility & engagement</h3>
        <SettingToggle
          checked={!!settings.showRiskScoreToEmployees}
          onChange={(b) => setSettings({ ...settings, showRiskScoreToEmployees: b })}
          title="Show employees their own risk and productivity scores"
          sub="Some teams prefer to share scores transparently; others find it counterproductive."
        />
        <div className="mt-4">
          <label className="label">Pulse survey frequency (days)</label>
          <input type="number" className="input max-w-[160px]" min="1" max="365"
            value={settings.pulseSurveyFrequencyDays}
            onChange={(e) => setSettings({ ...settings, pulseSurveyFrequencyDays: parseInt(e.target.value) || 14 })} />
        </div>
      </div>

      {/* Activity tracker (desktop agent) */}
      <div className="glass p-5">
        <h3 className="section-title mb-2 flex items-center gap-2">
          <Camera size={16} className="text-iris-300" />
          Activity tracker — screenshot timing
        </h3>
        <p className="text-sm text-ink-400 mb-4">
          Controls how often the desktop activity agent captures a screen. Applies to all employees in this organization. Lower values = more granular evidence but more storage.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">Screenshot interval (minutes)</label>
            <input
              type="number" min="1" max="240" className="input"
              value={settings.agent?.screenshotIntervalMinutes ?? ''}
              placeholder="10"
              onChange={(e) => {
                const raw = e.target.value;
                setSettings({
                  ...settings,
                  agent: {
                    ...(settings.agent || {}),
                    screenshotIntervalMinutes: raw === '' ? '' : Number(raw),
                  },
                });
              }}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                const clamped = Number.isFinite(v) ? Math.max(1, Math.min(240, v)) : 10;
                setSettings({
                  ...settings,
                  agent: { ...(settings.agent || {}), screenshotIntervalMinutes: clamped },
                });
              }}
            />
            <p className="text-xs text-ink-400 mt-1.5">Recommended: 10 minutes. Min 1, max 240.</p>
          </div>
          <div className="flex items-end">
            <SettingToggle
              checked={settings.agent?.screenshotsEnabled !== false}
              onChange={(b) => setSettings({
                ...settings,
                agent: { ...(settings.agent || {}), screenshotsEnabled: b },
              })}
              title="Enable screenshot capture"
              sub="If turned off, the agent stops taking screenshots. Keyboard/mouse counts and app usage continue."
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-ink-400 italic">
            Agent fetches this on each session start. Already-running agents will pick up the new value the next time the user clicks "Start Work".
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={saveAgentSettings}
            disabled={savingAgent}
          >
            {savingAgent ? 'Saving…' : 'Save tracker settings'}
          </button>
        </div>
      </div>

      {/* Manual Activity Entry */}
      <ManualActivityCard employees={employees} />

      {/* Departments */}
      <div className="glass p-5">
        <h3 className="section-title mb-4">Departments</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {departments.map((d) => (
            <span key={d._id} className="badge bg-white/[0.04] text-ink-200 border-white/10">{d.name}</span>
          ))}
          {departments.length === 0 && <p className="text-sm text-ink-400">No departments yet.</p>}
        </div>
        {role === 'ORG_ADMIN' && (
          <form onSubmit={addDept} className="flex gap-2 max-w-md">
            <input className="input flex-1" placeholder="New department name" value={newDept}
              onChange={(e) => setNewDept(e.target.value)} />
            <button className="btn-primary"><Plus size={14} /> Add</button>
          </form>
        )}
      </div>

      {role === 'ORG_ADMIN' && (
        <div className="glass p-5">
          <h3 className="section-title mb-4">Organization users</h3>
          <div className="overflow-x-auto mb-5">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">User</th>
                  <th className="table-th">Role</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {orgUsers.map((u) => (
                  <tr key={u._id}>
                    <td className="table-td">
                      <div className="font-medium text-ink-100">{u.name}</div>
                      <div className="text-xs text-ink-400">{u.email}</div>
                    </td>
                    <td className="table-td">{u.role}</td>
                    <td className="table-td">{u.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
                {!orgUsers.length && (
                  <tr><td className="table-td text-ink-400" colSpan={3}>No users added yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={addOrgUser} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="label">Name</label>
              <input className="input" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></div>
            <div><label className="label">Email</label>
              <input className="input" type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></div>
            <div><label className="label">Role</label>
              <select className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="HR_ADMIN">HR Admin</option>
                <option value="MANAGER">Manager</option>
              </select></div>
            <div><label className="label">Password</label>
              <input className="input" type="password" required minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></div>
            {newUser.role === 'MANAGER' && (
              <>
                <div><label className="label">Department</label>
                  <select className="input" value={newUser.departmentId} onChange={(e) => setNewUser({ ...newUser, departmentId: e.target.value })}>
                    <option value="">Select department</option>
                    {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select></div>
                <div><label className="label">Designation</label>
                  <input className="input" value={newUser.designation} onChange={(e) => setNewUser({ ...newUser, designation: e.target.value })} /></div>
              </>
            )}
            <div className="md:col-span-2 flex justify-end">
              <button className="btn-primary"><Plus size={14} /> Add user</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ManualActivityCard({ employees }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    employeeId: '', date: todayStr,
    activeMinutes: '', idleMinutes: '', breakMinutes: '', meetingMinutes: '',
    note: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const reset = () => setForm({
    employeeId: '', date: todayStr,
    activeMinutes: '', idleMinutes: '', breakMinutes: '', meetingMinutes: '',
    note: '',
  });

  const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.employeeId) { toast.error('Select an employee'); return; }
    if (!form.date) { toast.error('Date is required'); return; }
    const fields = ['activeMinutes', 'idleMinutes', 'breakMinutes', 'meetingMinutes'];
    if (fields.every((k) => form[k] === '' || form[k] === null)) {
      toast.error('Enter at least one minute value'); return;
    }

    setSubmitting(true);
    try {
      const payload = {
        employeeId: form.employeeId,
        date: new Date(form.date).toISOString(),
        activeMinutes: num(form.activeMinutes),
        idleMinutes: num(form.idleMinutes),
        breakMinutes: num(form.breakMinutes),
        meetingMinutes: num(form.meetingMinutes),
        totalLoggedMinutes:
          (num(form.activeMinutes) || 0) +
          (num(form.idleMinutes) || 0) +
          (num(form.breakMinutes) || 0) +
          (num(form.meetingMinutes) || 0) || undefined,
        source: 'self_report',
        note: form.note || undefined,
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      await activityService.upsert(payload);
      toast.success('Activity saved');
      reset();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save activity');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass p-5">
      <h3 className="section-title mb-2 flex items-center gap-2">
        <Activity size={16} className="text-iris-300" />
        Manual activity entry
      </h3>
      <p className="text-sm text-ink-400 mb-4">
        Record activity for an employee on a specific date. If an entry already exists for that date, it will be updated.
      </p>

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Employee</label>
          <select
            className="input"
            required
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          >
            <option value="">Select employee</option>
            {employees.map((e) => (
              <option key={e._id} value={e._id}>
                {e.name}{e.designation ? ` — ${e.designation}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            required
            max={todayStr}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Active minutes</label>
          <input
            type="number" min="0" max="1440" className="input"
            placeholder="e.g. 360"
            value={form.activeMinutes}
            onChange={(e) => setForm({ ...form, activeMinutes: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Idle minutes</label>
          <input
            type="number" min="0" max="1440" className="input"
            placeholder="e.g. 30"
            value={form.idleMinutes}
            onChange={(e) => setForm({ ...form, idleMinutes: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Break minutes</label>
          <input
            type="number" min="0" max="1440" className="input"
            placeholder="e.g. 60"
            value={form.breakMinutes}
            onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Meeting minutes</label>
          <input
            type="number" min="0" max="1440" className="input"
            placeholder="e.g. 45"
            value={form.meetingMinutes}
            onChange={(e) => setForm({ ...form, meetingMinutes: e.target.value })}
          />
        </div>

        <div className="md:col-span-2">
          <label className="label">Note (optional)</label>
          <textarea
            className="input min-h-[72px]"
            placeholder="Reason for manual entry, e.g. desktop agent was offline"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>

        <div className="md:col-span-2 flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
          <p className="text-xs text-ink-400">
            Saved as <span className="text-ink-200">self_report</span> source. Overwrites the day's row if it already exists.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={reset} disabled={submitting}>Reset</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save activity'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function SettingToggle({ checked, onChange, title, sub }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button type="button" onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full flex-shrink-0 transition relative mt-0.5 ${checked ? 'bg-iris-500' : 'bg-white/[0.10]'}`}
        style={{ boxShadow: checked ? '0 0 0 1px rgba(138,152,255,0.40), 0 0 12px rgba(77,82,245,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.10)' }}>
        <span className={`absolute top-0.5 ${checked ? 'right-0.5' : 'left-0.5'} w-5 h-5 rounded-full bg-white transition-all`}
          style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
      </button>
      <div>
        <p className="text-sm font-medium text-ink-100">{title}</p>
        {sub && <p className="text-xs text-ink-400 mt-0.5">{sub}</p>}
      </div>
    </label>
  );
}
