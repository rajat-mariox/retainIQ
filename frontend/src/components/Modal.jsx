import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}
      style={{ background: 'rgba(7,10,20,0.75)', backdropFilter: 'blur(8px)' }}>
      <div
        className={`glass-strong w-full ${sizes[size]} max-h-[90vh] overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <h3 className="font-semibold text-ink-100 text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
