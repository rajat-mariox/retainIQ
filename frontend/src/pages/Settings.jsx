import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsService, orgService } from '../services';
import { LoadingSpinner } from '../components/UIStates';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newDept, setNewDept] = useState('');
  const riskWeights = settings?.riskWeights || {};

  const load = async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        settingsService.get(),
        orgService.departments(),
      ]);
      setSettings(s.settings);
      setDepartments(d.items || []);
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

      {/* Departments */}
      <div className="glass p-5">
        <h3 className="section-title mb-4">Departments</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {departments.map((d) => (
            <span key={d._id} className="badge bg-white/[0.04] text-ink-200 border-white/10">{d.name}</span>
          ))}
          {departments.length === 0 && <p className="text-sm text-ink-400">No departments yet.</p>}
        </div>
        <form onSubmit={addDept} className="flex gap-2 max-w-md">
          <input className="input flex-1" placeholder="New department name" value={newDept}
            onChange={(e) => setNewDept(e.target.value)} />
          <button className="btn-primary"><Plus size={14} /> Add</button>
        </form>
      </div>
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
