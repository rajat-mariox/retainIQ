import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

const tracked = [
  'Start work and end work',
  'Active time',
  'Idle time',
  'App usage',
  'Screenshots if enabled',
];

const notTracked = [
  'Actual typed text',
  'Passwords',
  'Private chat content',
  'Webcam or microphone',
];

export default function EmployeeTransparencyPanel() {
  return (
    <div className="glass p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <ShieldCheck size={18} className="text-mint-300" />
        Activity transparency
      </h3>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <p className="text-sm font-medium text-mint-300 flex items-center gap-1.5 mb-2">
            <Eye size={14} /> What is tracked
          </p>
          <ul className="text-sm text-ink-300 space-y-1.5">
            {tracked.map((item) => (
              <li key={item} className="flex gap-2"><span className="text-mint-400">-</span>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-rose-300 flex items-center gap-1.5 mb-2">
            <EyeOff size={14} /> What is not tracked
          </p>
          <ul className="text-sm text-ink-300 space-y-1.5">
            {notTracked.map((item) => (
              <li key={item} className="flex gap-2"><span className="text-rose-400">x</span>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
