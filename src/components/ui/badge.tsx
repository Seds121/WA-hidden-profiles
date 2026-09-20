import type { ReactNode } from 'react';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary';

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
};

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-background text-foreground-muted border-border',
  success: 'bg-success-bg text-success border-success-border',
  warning: 'bg-warning-bg text-warning border-warning-border',
  error: 'bg-error-bg text-error border-error-border',
  info: 'bg-info-bg text-info border-info-border',
  primary: 'bg-primary-muted text-primary border-primary/20',
};

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-full)] border px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
