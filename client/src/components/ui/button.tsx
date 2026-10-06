import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'gold' | 'paper';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-naija-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none font-extrabold uppercase tracking-wide',
  secondary: 'bg-ink-700 text-paper border-2 border-ink-600 hover:border-ink-500 font-semibold',
  ghost: 'bg-transparent text-ink-200 hover:bg-ink-800 hover:text-paper font-semibold',
  outline: 'border-2 border-ink-500 bg-transparent text-paper hover:bg-ink-800 hover:border-ink-400 font-semibold',
  danger: 'bg-live text-paper border-2 border-ink-950 shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none font-bold uppercase tracking-wide',
  gold: 'bg-gold-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none font-extrabold uppercase tracking-wide',
  paper: 'bg-paper text-ink-950 border-2 border-ink-950 shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none font-extrabold uppercase tracking-wide',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs rounded-lg',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-12 px-6 text-sm rounded-xl',
  icon: 'h-10 w-10 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 select-none transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900',
        'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
