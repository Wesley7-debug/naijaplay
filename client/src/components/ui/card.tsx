import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border-2 border-ink-700 bg-ink-850 shadow-hard overflow-hidden', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

type BadgeTone = 'default' | 'live' | 'naija' | 'gold' | 'danger' | 'outline' | 'paper';
const badgeTones: Record<BadgeTone, string> = {
  default: 'bg-ink-700 text-ink-200 border border-ink-600',
  live: 'bg-live text-paper border-2 border-ink-950 shadow-hard-sm -rotate-1',
  naija: 'bg-naija-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm -rotate-1',
  gold: 'bg-gold-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm rotate-1',
  danger: 'bg-live/15 text-red-400 border border-live/40',
  outline: 'border border-ink-500 text-ink-300',
  paper: 'bg-paper text-ink-950 border-2 border-ink-950 shadow-hard-sm',
};

export function Badge({ tone = 'default', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider', badgeTones[tone], className)}
      {...props}
    />
  );
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-paper border-2 border-ink-950 shadow-hard-sm -rotate-1', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-paper animate-pulse-live" aria-hidden />
      Live
    </span>
  );
}

export function Avatar({ src, name, size = 40, className }: { src?: string | null; name?: string; size?: number; className?: string }) {
  const initials = (name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const [errored, setErrored] = React.useState(false);
  // A failed URL must not stick once the avatar changes (e.g. right after upload).
  React.useEffect(() => {
    setErrored(false);
  }, [src]);
  if (!src || errored) {
    return (
      <span
        className={cn('inline-flex items-center justify-center rounded-xl bg-naija-500 text-ink-950 font-black border-2 border-ink-950 shrink-0', className)}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
        aria-hidden
      >
        {initials}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={name ? `${name} avatar` : ''}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={cn('rounded-xl object-cover shrink-0 bg-ink-700 border-2 border-ink-950', className)}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-ink-800 border border-ink-700', className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}>
      {icon && <div className="mb-3 text-ink-500">{icon}</div>}
      <p className="section-kicker mb-1">Nothing here yet</p>
      <h3 className="font-display text-xl uppercase text-paper">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-ink-300 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ButtonLink({
  to,
  children,
  variant = 'primary',
  className,
}: {
  to: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  className?: string;
}) {
  const styles = {
    primary: 'bg-naija-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm font-extrabold uppercase tracking-wide text-xs',
    secondary: 'bg-ink-700 text-paper border-2 border-ink-600',
    outline: 'border-2 border-ink-500 text-paper hover:bg-ink-800',
    ghost: 'text-ink-300 hover:text-paper hover:bg-ink-800',
  }[variant];
  return (
    <Link
      to={to}
      className={cn('inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm transition-all', styles, className)}
    >
      {children}
    </Link>
  );
}
