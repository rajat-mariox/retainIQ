import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { ArrowLeft, RefreshCw, Plus, Mail, Phone, Briefcase, Calendar, Sparkles, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeService, riskService, interventionService, signalService } from '../services';
import RiskBadge from '../components/RiskBadge';
import { LoadingSpinner } from '../components/UIStates';
import Modal from '../components/Modal';
import { formatDate, RISK_COLORS } from '../utils/format';
import { useAuthStore } from '../store/authStore';

const INTERVENTION_TYPES = [
  '1:1 meeting', 'salary review', 'role change discussion', 'workload discussion',
  'training support', 'grievance handling', 'manager feedback session',
];

export default function EmployeeDetail() {
  const { id } = useParams();
  const userId = useAuthStore((s) => s.user?._id);
  const [employee, setEmployee] = useState(null);
  const [risk, setRisk] = useState(null);
  const [interventions, setInterventions] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalc, setRecalc] = useState(false);
  const [showInterv, setShowInterv] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [emp, r, ints, sigs] = await Promise.all([
        employeeService.get(id),
        riskService.latest(id).catch(() => null),
        interventionService.byEmployee(id).then((d) => d.items).catch(() => []),
        signalService.forEmployee(id).then((d) => d.items).catch(() => []),
      ]);
      setEmployee(emp); setRisk(r); setInterventions(ints); setSignals(sigs);
    } catch { toast.error('Failed to load employee'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [id]);

  const recalcRisk = async () => {
    setRecalc(true);
    try { await riskService.calculate(id); toast.success('Risk recalculated'); await load(); }
    catch { toast.error('Failed to recalculate'); }
    finally { setRecalc(false); }
  };

  if (loading || !employee) return <LoadingSpinner label="Loading employee…" />;

  const score = risk?.assessment?.riskScore ?? employee.currentRiskScore ?? 0;
  const category = risk?.assessment?.category || employee.currentRiskCategory || 'Low';
  const cat = RISK_COLORS[category];

  const componentData = risk?.assessment?.componentScores
    ? Object.entries(risk.assessment.componentScores).map(([k, v]) => ({ name: k, value: v }))
    : [];

  const history = (risk?.history || []).slice().reverse().map((h) => ({
    date: new Date(h.computedAt).toLocaleDateString(),
    score: h.riskScore,
  }));

  return (
    <div className="space-y-5">
      <Link to="/employees" className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-200 transition">
        <ArrowLeft size={14} /> Back to employees
      </Link>

      {/* Header card */}
      <div className="glass p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-semibold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #8a98ff 0%, #4d52f5 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.20) inset, 0 12px 28px -8px rgba(77,82,245,0.55)' }}>
            {employee.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-100 tracking-tight">{employee.name}</h1>
            <p className="text-sm text-ink-300">{employee.designation}{employee.departmentId?.name ? ` · ${employee.departmentId.name}` : ''}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-ink-400">
              <span className="inline-flex items-center gap-1.5"><Mail size={12} /> {employee.email}</span>
              {employee.phone && <span className="inline-flex items-center gap-1.5"><Phone size={12} /> {employee.phone}</span>}
              <span className="inline-flex items-center gap-1.5"><Briefcase size={12} /> {employee.workMode}</span>
              {employee.joiningDate && <span className="inline-flex items-center gap-1.5"><Calendar size={12} /> Joined {formatDate(employee.joiningDate)}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/employees/${id}/productivity`} className="btn-secondary">
            <Activity size={14} /> Productivity
          </Link>
          <button onClick={recalcRisk} disabled={recalc} className="btn-secondary">
            <RefreshCw size={14} className={recalc ? 'animate-spin' : ''} />
            {recalc ? 'Calculating…' : 'Recalculate risk'}
          </button>
        </div>
      </div>

      {/* Risk gauge + components */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="glass p-5">
          <h3 className="section-title mb-2">Current risk</h3>
          <div className="flex items-center justify-center my-2">
            <ResponsiveContainer width="100%" height={200}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%"
                data={[{ name: 'risk', value: score, fill: cat.hex }]} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background={{ fill: 'rgba(255,255,255,0.04)' }} dataKey="value" cornerRadius={12} />
                <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontSize="34" fontWeight="700" fill="#dde1ee">{score}</text>
                <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#5b6691">/ 100</text>
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center"><RiskBadge category={category} /></div>
          <p className="text-xs text-ink-400 text-center mt-3">
            Trend: <span className="text-ink-200">{risk?.assessment?.trend || 'Stable'}</span> · Confidence: <span className="text-ink-200">{risk?.assessment?.confidence ? Math.round(risk.assessment.confidence * 100) + '%' : '—'}</span>
          </p>
        </div>

        <div className="glass p-5 lg:col-span-2">
          <h3 className="section-title mb-4">Risk components</h3>
          {componentData.length === 0 ? (
            <p className="text-sm text-ink-400">No risk data yet. Click "Recalculate risk".</p>
          ) : (
            <div className="space-y-3.5">
              {componentData.map((c) => (
                <div key={c.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="capitalize text-ink-200">{c.name}</span>
                    <span className="font-medium text-ink-100">{c.value}/100</span>
                  </div>
                  <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${c.value}%`, background: 'linear-gradient(90deg, #8a98ff 0%, #4d52f5 100%)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI insights */}
      {risk?.assessment && (
        <div className="glass p-5">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-iris-400/15 border border-iris-400/30 flex items-center justify-center">
              <Sparkles size={14} className="text-iris-300" />
            </span>
            AI-generated insights
          </h3>
          {risk.assessment.aiExplanation && (
            <div className="rounded-xl p-4 mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(77,82,245,0.10), rgba(77,82,245,0.02))', border: '1px solid rgba(138,152,255,0.18)' }}>
              <p className="text-sm text-ink-100 leading-relaxed">{risk.assessment.aiExplanation}</p>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <p className="text-sm font-medium text-ink-100 mb-2.5">Top contributing factors</p>
              <ul className="text-sm text-ink-300 space-y-1.5">
                {(risk.assessment.topFactors || []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2"><span className="text-iris-400 mt-0.5">•</span> {f}</li>
                ))}
                {(!risk.assessment.topFactors || risk.assessment.topFactors.length === 0) && (
                  <li className="text-ink-400">No strong risk factors detected.</li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-ink-100 mb-2.5">Recommended action</p>
              <p className="text-sm text-ink-300">{risk.assessment.recommendedAction}</p>
              {risk.assessment.aiTalkingPoints?.length > 0 && (
                <>
                  <p className="text-sm font-medium text-ink-100 mt-4 mb-2.5">1:1 talking points</p>
                  <ul className="text-sm text-ink-300 space-y-1.5">
                    {risk.assessment.aiTalkingPoints.map((tp, i) => (
                      <li key={i} className="flex items-start gap-2"><span className="text-iris-400 mt-0.5">•</span> {tp}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-amber-400/80 mt-5 italic">
            Decision-support insights only — never the sole basis for employment decisions.
          </p>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="glass p-5">
          <h3 className="section-title mb-4">Risk history</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5b6691' }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#8a98ff" strokeWidth={2.5} dot={{ r: 3, fill: '#8a98ff' }} activeDot={{ r: 5, fill: '#fff', stroke: '#4d52f5', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Interventions */}
      <div className="glass overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="section-title">Interventions</h3>
          <button className="btn-primary" onClick={() => setShowInterv(true)}>
            <Plus size={14} /> New intervention
          </button>
        </div>
        {interventions.length === 0 ? (
          <p className="text-sm text-ink-400 p-8 text-center">No interventions yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Type</th>
                <th className="table-th">Owner</th>
                <th className="table-th">Status</th>
                <th className="table-th">Due</th>
                <th className="table-th">Risk at creation</th>
              </tr>
            </thead>
            <tbody>
              {interventions.map((i) => (
                <tr key={i._id}>
                  <td className="table-td font-medium text-ink-100">{i.type}</td>
                  <td className="table-td">{i.ownerId?.name || '—'}</td>
                  <td className="table-td capitalize">{i.status?.replace('_', ' ')}</td>
                  <td className="table-td muted">{formatDate(i.dueDate)}</td>
                  <td className="table-td">{i.riskScoreAtCreation ?? '—'} ({i.riskCategoryAtCreation || '—'})</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateInterventionModal open={showInterv} onClose={() => setShowInterv(false)}
        employeeId={id} ownerId={userId} onCreated={load} />
    </div>
  );
}

function CreateInterventionModal({ open, onClose, employeeId, ownerId, onCreated }) {
  const [form, setForm] = useState({ type: '1:1 meeting', dueDate: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await interventionService.create({
        employeeId, ownerId, type: form.type,
        dueDate: form.dueDate || undefined, notes: form.notes || undefined,
      });
      toast.success('Intervention created');
      onClose(); onCreated();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New intervention">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {INTERVENTION_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input className="input" type="date" value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
