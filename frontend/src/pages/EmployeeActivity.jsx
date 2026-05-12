import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowLeft, Camera, Clock, Coffee, MousePointer2, Timer, X } from 'lucide-react';
import toast from 'react-hot-toast';
import StatCard from '../components/StatCard';
import ProductivityBadge from '../components/ProductivityBadge';
import { LoadingSpinner } from '../components/UIStates';
import { activityService, employeeService, productivityService } from '../services';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

function minutesLabel(value = 0) {
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function imageUrl(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`;
}

export default function EmployeeActivity() {
  const { id: employeeId } = useParams();
  const [employee, setEmployee] = useState(null);
  const [data, setData] = useState(null);
  const [scores, setScores] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewShot, setPreviewShot] = useState(null);

  useEffect(() => {
    if (!previewShot) return;
    const onKey = (e) => { if (e.key === 'Escape') setPreviewShot(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewShot]);

  useEffect(() => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [emp, activity, scoreData, shotData, appData] = await Promise.all([
          employeeService.get(employeeId).catch(() => null),
          activityService.forEmployee(employeeId, 30),
          productivityService.scoresFor(employeeId, 30).catch(() => ({ items: [] })),
          activityService.screenshots(employeeId, { days: 14, limit: 12 }).catch(() => ({ items: [] })),
          activityService.apps(employeeId, { days: 14, limit: 100 }).catch(() => ({ summary: [] })),
        ]);
        setEmployee(emp);
        setData(activity);
        setScores(scoreData.items || []);
        setScreenshots(shotData.items || []);
        setApps(appData.summary || []);
      } catch {
        toast.error('Failed to load activity');
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  if (loading) return <LoadingSpinner label="Loading activity…" />;
  if (!employeeId) {
    return (
      <div className="glass p-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-ink-100">Activity unavailable</h1>
        <p className="text-sm text-ink-400 mt-2">No employee selected.</p>
      </div>
    );
  }

  const summary = data?.summary || {};
  const latestScore = scores[scores.length - 1];
  const chartData = (data?.sessions || []).slice().reverse().slice(-14).map((s) => ({
    date: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    active: s.activeMinutes || 0,
    idle: s.idleMinutes || 0,
    break: s.breakMinutes || 0,
  }));
  const timeSplit = [
    { name: 'Active', value: summary.activeMinutes || 0, color: '#7de4be' },
    { name: 'Idle', value: summary.idleMinutes || 0, color: '#ff9bb0' },
    { name: 'Break', value: summary.breakMinutes || 0, color: '#ffd38a' },
  ];

  return (
    <div className="space-y-6">
      <Link to="/employee-activity" className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-200 transition">
        <ArrowLeft size={14} /> Back to employee activity
      </Link>

      <div>
        <p className="text-iris-300 text-xs font-medium tracking-wider uppercase mb-1.5">Employee Activity</p>
        <h1 className="text-3xl font-bold text-ink-100 tracking-tight">{employee?.name || 'Activity detail'}</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          {employee?.designation || employee?.email || ''}
          {employee?.departmentId?.name ? ` · ${employee.departmentId.name}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard tone="iris" label="Work time" value={minutesLabel(summary.totalMinutes)} sub="Last 30 days" icon={Clock} />
        <StatCard tone="mint" label="Active time" value={minutesLabel(summary.activeMinutes)} sub="Keyboard/mouse active" icon={MousePointer2} />
        <StatCard tone="peach" label="Idle time" value={minutesLabel(summary.idleMinutes)} sub="No activity windows" icon={Timer} />
        <StatCard tone="cream" label="Break time" value={minutesLabel(summary.breakMinutes)} sub="Marked breaks" icon={Coffee} />
        <div className="glass p-4">
          <p className="text-xs text-ink-400 uppercase tracking-wider mb-2">Productivity score</p>
          {latestScore ? <ProductivityBadge band={latestScore.band} score={latestScore.score} /> : <p className="text-ink-300">No score yet</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="glass p-5 lg:col-span-2">
          <h3 className="section-title mb-4">Start and end work history</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="active-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7de4be" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#7de4be" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6691' }} />
              <YAxis tick={{ fontSize: 11, fill: '#5b6691' }} />
              <Tooltip />
              <Area type="monotone" dataKey="active" stroke="#7de4be" fill="url(#active-fill)" />
              <Area type="monotone" dataKey="idle" stroke="#ff9bb0" fill="transparent" />
              <Area type="monotone" dataKey="break" stroke="#ffd38a" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="glass p-5">
          <h3 className="section-title mb-4">Activity split</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={timeSplit} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} stroke="rgba(11,16,32,0.8)" strokeWidth={2}>
                {timeSplit.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value) => minutesLabel(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass p-5">
          <h3 className="section-title mb-4">App usage</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={apps.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="appName" tick={{ fontSize: 11, fill: '#5b6691' }} />
              <YAxis tick={{ fontSize: 11, fill: '#5b6691' }} />
              <Tooltip formatter={(value) => `${Math.round(value / 60)}m`} />
              <Bar dataKey="durationSeconds" fill="#8a98ff" radius={[7, 7, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass p-5">
          <h3 className="section-title mb-4 flex items-center gap-2"><Camera size={16} className="text-iris-300" /> Screenshots</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {screenshots.length === 0 && <p className="text-sm text-ink-400 col-span-full">No screenshots captured yet.</p>}
            {screenshots.slice(0, 6).map((shot) => (
              <button
                key={shot._id}
                type="button"
                onClick={() => setPreviewShot(shot)}
                className="group relative aspect-video w-full rounded-lg overflow-hidden border border-white/[0.08] hover:border-iris-400/50 transition focus:outline-none focus:ring-2 focus:ring-iris-400/60"
              >
                <img
                  src={imageUrl(shot.imageUrl)}
                  alt={shot.activeApp || 'Activity screenshot'}
                  className="w-full h-full object-cover transition group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {previewShot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewShot(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewShot(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
          <div
            className="max-w-6xl max-h-[90vh] w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageUrl(previewShot.imageUrl)}
              alt={previewShot.activeApp || 'Activity screenshot'}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="text-center text-xs text-ink-300">
              {previewShot.activeApp && <span className="font-medium text-ink-100">{previewShot.activeApp}</span>}
              {previewShot.activeApp && previewShot.capturedAt && <span className="mx-2">·</span>}
              {previewShot.capturedAt && <span>{new Date(previewShot.capturedAt).toLocaleString()}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
