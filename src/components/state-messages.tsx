import type { ReactNode } from 'react';
import { InfoIcon, UserSearchIcon, XCircleIcon } from './ui/icons';

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: 'search' | 'info';
};

export function EmptyState({ title, description, icon = 'search' }: EmptyStateProps) {
  const Icon = icon === 'search' ? UserSearchIcon : InfoIcon;
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-border bg-background px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-full)] bg-primary-muted text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-foreground-muted">{description}</p>
    </div>
  );
}

type ErrorStateProps = {
  title: string;
  message: string;
  children?: ReactNode;
};

export function ErrorState({ title, message, children }: ErrorStateProps) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-error-border bg-error-bg p-4 sm:p-5"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-error" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-error">{title}</h3>
          <p className="mt-1 text-sm text-error/90">{message}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
