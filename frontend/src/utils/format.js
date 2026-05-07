// Color tokens for risk and productivity badges, calibrated for the dark theme.

export const RISK_COLORS = {
  Low:      { bg: 'bg-mint-400/15',  text: 'text-mint-300',  ring: 'border-mint-400/30',  hex: '#7de4be' },
  Medium:   { bg: 'bg-cream-400/15', text: 'text-cream-300', ring: 'border-cream-400/30', hex: '#ecdf9c' },
  High:     { bg: 'bg-peach-400/15', text: 'text-peach-300', ring: 'border-peach-400/30', hex: '#ffb18a' },
  Critical: { bg: 'bg-rose-400/15',  text: 'text-rose-300',  ring: 'border-rose-400/30',  hex: '#ff9bb0' },
};

export function categoryFromScore(score) {
  if (score <= 30) return 'Low';
  if (score <= 55) return 'Medium';
  if (score <= 75) return 'High';
  return 'Critical';
}

export const PRODUCTIVITY_COLORS = {
  'High Performer':  { bg: 'bg-mint-400/15', text: 'text-mint-300', ring: 'border-mint-400/30', hex: '#7de4be' },
  'Stable':          { bg: 'bg-iris-400/15', text: 'text-iris-300', ring: 'border-iris-400/30', hex: '#8a98ff' },
  'Needs Attention': { bg: 'bg-peach-400/15',text: 'text-peach-300',ring: 'border-peach-400/30',hex: '#ffb18a' },
};

export function productivityBandFromScore(score) {
  if (score >= 75) return 'High Performer';
  if (score >= 50) return 'Stable';
  return 'Needs Attention';
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatNumber(n, currency) {
  if (n == null) return '—';
  if (currency) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
    catch { return n.toLocaleString(); }
  }
  return n.toLocaleString();
}
