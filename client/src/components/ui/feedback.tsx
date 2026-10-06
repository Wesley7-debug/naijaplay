import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid place-items-center py-20 text-center" role="status">
      <Spinner className="h-8 w-8 text-naija-400" />
      <p className="mt-3 text-sm text-ink-400">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="grid place-items-center py-16 text-center" role="alert">
      <p className="font-display font-bold text-white">Something went wrong</p>
      <p className="mt-1 text-sm text-ink-400 max-w-sm">{message || 'We could not load this. Check your connection.'}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 h-10 rounded-xl border border-ink-600 px-5 text-sm font-semibold text-white hover:bg-ink-800"
        >
          Try again
        </button>
      )}
    </div>
  );
}
