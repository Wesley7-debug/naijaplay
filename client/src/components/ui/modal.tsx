import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function useEscape(onClose: () => void, open: boolean) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  sheet?: boolean;
}

/** Accessible dialog: focus lands inside, Escape closes, backdrop click closes. */
export function Modal({ open, onClose, title, children, className, sheet }: ModalProps) {
  useEscape(onClose, open);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      // Move focus into the dialog for keyboard users.
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        className={cn(
          'relative w-full sm:max-w-lg bg-ink-850 border-2 border-paper outline-none shadow-hard',
          'max-h-[92vh] overflow-y-auto animate-slide-up',
          sheet
            ? 'rounded-t-3xl sm:rounded-3xl pb-[env(safe-area-inset-bottom)]'
            : 'rounded-t-3xl sm:rounded-3xl mx-3 sm:mx-0',
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-ink-850/95 backdrop-blur border-b-2 border-ink-700">
          <h2 className="font-display text-lg uppercase text-paper">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg border-2 border-ink-600 p-1.5 text-ink-300 hover:text-paper hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
