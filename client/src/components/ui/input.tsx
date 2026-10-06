import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border-2 border-ink-600 bg-ink-950 px-3.5 text-sm text-paper placeholder:text-ink-500',
        'focus:outline-none focus:border-naija-400 transition',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[90px] w-full rounded-xl border-2 border-ink-600 bg-ink-950 px-3.5 py-2.5 text-sm text-paper placeholder:text-ink-500',
        'focus:outline-none focus:border-naija-400 transition resize-y',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-xs font-extrabold uppercase tracking-wider text-ink-200 mb-1.5', className)} {...props} />;
}

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border-2 border-ink-600 bg-ink-950 px-3 text-sm text-paper',
        'focus:outline-none focus:border-naija-400 transition appearance-none',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-bold text-live" role="alert">⚠ {message}</p>;
}
