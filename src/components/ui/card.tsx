import type { ReactNode } from 'react';

type CardAccent = 'default' | 'indigo' | 'violet' | 'sky';

type CardProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  icon?: ReactNode;
  accent?: CardAccent;
};

const accentBorder: Record<CardAccent, string> = {
  default: 'border-border',
  indigo: 'border-indigo-200/80',
  violet: 'border-violet-200/80',
  sky: 'border-sky-200/80',
};

const accentHeader: Record<CardAccent, string> = {
  default: '',
  indigo: 'bg-gradient-to-r from-indigo-500/5 to-transparent',
  violet: 'bg-gradient-to-r from-violet-500/5 to-transparent',
  sky: 'bg-gradient-to-r from-sky-500/5 to-transparent',
};

export function Card({
  children,
  className = '',
  title,
  description,
  icon,
  accent = 'default',
}: CardProps) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--radius-xl)] border bg-surface shadow-[var(--shadow-md)] ${accentBorder[accent]} ${className}`}
    >
      {(title || description) && (
        <header
          className={`border-b border-border px-4 py-4 sm:px-6 ${accentHeader[accent]}`}
        >
          <div className="flex items-start gap-3">
            {icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary-muted text-primary">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold text-foreground sm:text-lg">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-sm text-foreground-muted">{description}</p>
              )}
            </div>
          </div>
        </header>
      )}
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}
