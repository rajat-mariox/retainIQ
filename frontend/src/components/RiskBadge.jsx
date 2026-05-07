import { RISK_COLORS } from '../utils/format';

export default function RiskBadge({ category, score }) {
  const c = RISK_COLORS[category] || RISK_COLORS.Low;
  return (
    <span className={`badge ${c.bg} ${c.text} ${c.ring}`}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: c.hex }} />
      {category}{typeof score === 'number' ? ` · ${score}` : ''}
    </span>
  );
}
