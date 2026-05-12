import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { pulseService } from '../services';
import EmployeeTransparencyPanel from '../components/EmployeeTransparencyPanel';

export function EmployeePortal() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="space-y-5 max-w-4xl">
      <div className="glass p-6 relative overflow-hidden">
        <div
          className="absolute -top-10 -right-10 w-48 h-48 rounded-3xl rotate-45"
          style={{ background: 'linear-gradient(135deg, rgba(167,240,212,0.15), rgba(125,228,190,0.02))', filter: 'blur(20px)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #ff9bb0 0%, #f06585 100%)' }}
            >
              <Heart size={18} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-ink-100 tracking-tight">Welcome, {user?.name}</h1>
          </div>
          <p className="text-sm text-ink-300">
            Your space to share how things are going. Pulse responses are private and anonymized in aggregate.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/portal/pulse" className="glass p-5 hover:bg-white/[0.04] transition group">
          <div className="w-10 h-10 rounded-xl bg-iris-400/15 border border-iris-400/30 flex items-center justify-center mb-3">
            <MessageSquare size={18} className="text-iris-300" />
          </div>
          <p className="font-semibold text-ink-100">Submit a pulse</p>
          <p className="text-sm text-ink-400 mt-1.5">A 30-second check-in on mood, workload, support, and growth.</p>
        </a>
        <a href="/portal/productivity" className="glass p-5 hover:bg-white/[0.04] transition group">
          <div className="w-10 h-10 rounded-xl bg-mint-400/15 border border-mint-400/30 flex items-center justify-center mb-3">
            <Heart size={18} className="text-mint-300" />
          </div>
          <p className="font-semibold text-ink-100">My productivity</p>
          <p className="text-sm text-ink-400 mt-1.5">View your own productivity trend and the data we collect about you.</p>
        </a>
      </div>

      <EmployeeTransparencyPanel />
    </div>
  );
}

export function PulseSurvey() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState({
    moodScore: 4,
    workloadScore: 3,
    managerSupportScore: 4,
    growthSatisfactionScore: 4,
    comment: '',
    requestHRCallback: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await pulseService.submit({
        ...answers,
        moodScore: parseInt(answers.moodScore),
        workloadScore: parseInt(answers.workloadScore),
        managerSupportScore: parseInt(answers.managerSupportScore),
        growthSatisfactionScore: parseInt(answers.growthSatisfactionScore),
      });
      toast.success('Thanks for sharing');
      navigate('/portal');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="glass p-6">
        <h1 className="text-2xl font-bold text-ink-100 tracking-tight mb-1.5">Pulse check-in</h1>
        <p className="text-sm text-ink-400 mb-6">Anonymous in aggregate. Honesty helps us help you.</p>

        <form onSubmit={submit} className="space-y-5">
          <RangeQuestion
            label="How is your mood this week?"
            lo="Low"
            hi="Great"
            value={answers.moodScore}
            onChange={(v) => setAnswers({ ...answers, moodScore: v })}
          />
          <RangeQuestion
            label="How manageable is your workload?"
            lo="Not manageable"
            hi="Very manageable"
            value={answers.workloadScore}
            onChange={(v) => setAnswers({ ...answers, workloadScore: v })}
          />
          <RangeQuestion
            label="How supported do you feel by your manager?"
            lo="Not supported"
            hi="Very supported"
            value={answers.managerSupportScore}
            onChange={(v) => setAnswers({ ...answers, managerSupportScore: v })}
          />
          <RangeQuestion
            label="How satisfied are you with your growth?"
            lo="Not satisfied"
            hi="Very satisfied"
            value={answers.growthSatisfactionScore}
            onChange={(v) => setAnswers({ ...answers, growthSatisfactionScore: v })}
          />

          <div>
            <label className="label">Anything you want to share? (optional)</label>
            <textarea
              className="input min-h-[100px]"
              value={answers.comment}
              onChange={(e) => setAnswers({ ...answers, comment: e.target.value })}
              placeholder="What's on your mind?"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={answers.requestHRCallback}
              onChange={(e) => setAnswers({ ...answers, requestHRCallback: e.target.checked })}
              className="accent-iris-400"
            />
            Request an HR callback
          </label>

          <button className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit pulse'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RangeQuestion({ label, lo, hi, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="range"
        min="1"
        max="5"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-iris-400"
      />
      <div className="flex justify-between text-xs text-ink-400 mt-1.5">
        <span>{lo}</span>
        <span className="text-iris-300 font-semibold text-sm">{value}/5</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}
