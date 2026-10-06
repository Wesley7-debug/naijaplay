import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100vw-24px)] max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border-2 border-ink-950 px-4 py-3 shadow-hard animate-slide-up',
            t.kind === 'success' && 'bg-naija-400 text-ink-950',
            t.kind === 'error' && 'bg-live text-paper',
            t.kind === 'info' && 'bg-paper text-ink-950',
          )}
        >
          <span className="mt-0.5 shrink-0">
            {t.kind === 'success' && <CheckCircle2 className="h-5 w-5" />}
            {t.kind === 'error' && <XCircle className="h-5 w-5" />}
            {t.kind === 'info' && <Info className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold uppercase tracking-wide">{t.title}</p>
            {t.description && <p className="text-xs mt-0.5 break-words opacity-80 font-medium">{t.description}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
