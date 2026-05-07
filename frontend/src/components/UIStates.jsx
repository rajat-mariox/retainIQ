export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="glass p-12 text-center">
      {Icon && (
        <div className="mx-auto w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-ink-300 mb-4">
          <Icon size={24} strokeWidth={1.5} />
        </div>
      )}
      <p className="font-semibold text-ink-100 text-base">{title}</p>
      {message && <p className="text-sm text-ink-400 mt-1.5 max-w-md mx-auto">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center py-16 text-ink-400 text-sm">
      <div className="relative w-5 h-5 mr-3">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-iris-400 animate-spin" />
      </div>
      {label}
    </div>
  );
}
