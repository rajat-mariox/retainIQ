import { PRODUCTIVITY_COLORS } from '../utils/format';

export default function ProductivityBadge({ band, score }) {
  const c = PRODUCTIVITY_COLORS[band] || PRODUCTIVITY_COLORS.Stable;
  return (
    <span className={`badge ${c.bg} ${c.text} ${c.ring}`}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: c.hex }} />
      {band}{typeof score === 'number' ? ` · ${score}` : ''}
    </span>
  );
}
