import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { SpinnerIcon } from './icons';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary-hover border-transparent shadow-sm',
  secondary:
    'bg-surface text-foreground border-border hover:bg-background border shadow-sm',
  danger:
    'bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700 border shadow-sm',
  ghost:
    'bg-transparent text-foreground-muted hover:text-foreground hover:bg-background border-transparent',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`focus-ring inline-flex items-center justify-center rounded-[var(--radius-md)] border font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading && <SpinnerIcon className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  );
}
