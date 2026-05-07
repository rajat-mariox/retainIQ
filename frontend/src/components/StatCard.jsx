import { ArrowUpRight } from 'lucide-react';

const TONES = {
  iris:  { tile: 'stat-tile-iris',  label: 'text-iris-100', value: 'text-white',     sub: 'text-iris-100/80' },
  mint:  { tile: 'stat-tile-mint',  label: 'text-emerald-900', value: 'text-emerald-950', sub: 'text-emerald-900/80' },
  peach: { tile: 'stat-tile-peach', label: 'text-orange-900',  value: 'text-orange-950',  sub: 'text-orange-900/80' },
  cream: { tile: 'stat-tile-cream', label: 'text-yellow-900',  value: 'text-yellow-950',  sub: 'text-yellow-900/80' },
  rose:  { tile: 'stat-tile-rose',  label: 'text-rose-900',    value: 'text-rose-950',    sub: 'text-rose-900/80' },
  sky:   { tile: 'stat-tile-sky',   label: 'text-sky-900',     value: 'text-sky-950',     sub: 'text-sky-900/80' },
};

/**
 * StatCard with diamond ornament, mimicking the reference design.
 *
 * Props:
 *   label, value, sub  → text content
 *   icon               → optional Lucide icon (rendered subtly in corner)
 *   tone               → 'iris' | 'mint' | 'peach' | 'cream' | 'rose' | 'sky'
 *   trend              → optional 'up' | 'down' | 'flat' (shows arrow chip)
 *   onClick            → optional, makes the whole tile clickable with arrow
 */
export default function StatCard({ label, value, sub, icon: Icon, tone = 'iris', trend, onClick, href }) {
  const t = TONES[tone] || TONES.iris;
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper onClick={onClick} className={`stat-tile ${t.tile} p-5 text-left w-full group`} type={onClick ? 'button' : undefined}>
      {/* Decorative diamond (top-right) */}
      <span className="stat-diamond" style={{ top: '50%', left: '70%' }} />
      <span className="stat-diamond" style={{ top: '20%', left: '90%', width: '50%', opacity: 0.5 }} />

      {/* Content sits above the ornaments */}
      <div className="relative z-10 flex flex-col gap-1.5 min-h-[110px]">
        <div className="flex items-start justify-between">
          <p className={`text-xs font-medium uppercase tracking-wider ${t.label}`}>{label}</p>
          {Icon && (
            <div className={`opacity-50 ${t.value}`}>
              <Icon size={16} strokeWidth={2} />
            </div>
          )}
        </div>

        <p className={`text-4xl font-bold tracking-tight ${t.value}`}>{value}</p>

        <div className="flex items-center justify-between mt-auto">
          {sub && <p className={`text-xs ${t.sub}`}>{sub}</p>}
          {(onClick || href) && (
            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/30 backdrop-blur-sm transition group-hover:bg-white/50 group-hover:translate-x-0.5 ${t.value}`}>
              <ArrowUpRight size={14} strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
