'use client';

import type { ReactNode } from 'react';

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  accent?: 'indigo' | 'violet' | 'sky' | 'amber';
};

const accentClasses: Record<NonNullable<StatCardProps['accent']>, string> = {
  indigo: 'from-indigo-500/10 to-indigo-600/5 border-indigo-200/80 text-indigo-600',
  violet: 'from-violet-500/10 to-violet-600/5 border-violet-200/80 text-violet-600',
  sky: 'from-sky-500/10 to-sky-600/5 border-sky-200/80 text-sky-600',
  amber: 'from-amber-500/10 to-amber-600/5 border-amber-200/80 text-amber-600',
};

function StatCard({ label, value, hint, icon, accent = 'indigo' }: StatCardProps) {
  return (
    <article
      className={`rounded-[var(--radius-lg)] border bg-gradient-to-br p-4 shadow-[var(--shadow-sm)] ${accentClasses[accent]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">
            {label}
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
          {hint && (
            <p className="mt-1 text-xs text-foreground-muted">{hint}</p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-surface/80 shadow-[var(--shadow-sm)]">
          {icon}
        </div>
      </div>
    </article>
  );
}

type QuickStatsProps = {
  connected: boolean;
  activityCount: number;
  lookupCount: number;
};

export function QuickStats({
  connected,
  activityCount,
  lookupCount,
}: QuickStatsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        label="WhatsApp"
        value={connected ? 'Online' : 'Offline'}
        hint={connected ? 'Ready for lookups' : 'Scan QR to connect'}
        accent={connected ? 'sky' : 'amber'}
        icon={
          <span className="text-lg" aria-hidden="true">
            {connected ? '●' : '○'}
          </span>
        }
      />
      <StatCard
        label="Server session"
        value="1 account"
        hint="Shared by all visitors"
        accent="violet"
        icon={
          <span className="text-sm font-bold" aria-hidden="true">
            1×
          </span>
        }
      />
      <StatCard
        label="This browser"
        value={`${lookupCount} lookups`}
        hint={`${activityCount} log events saved`}
        accent="indigo"
        icon={
          <span className="text-sm font-bold" aria-hidden="true">
            #
          </span>
        }
      />
    </div>
  );
}
