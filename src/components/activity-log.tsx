'use client';

import { useEffect, useState } from 'react';
import type { ActivityEntry, ActivityTone } from '@/hooks/use-activity-log';
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from '@/hooks/use-activity-log';
import { Button } from './ui/button';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  InfoIcon,
  TrashIcon,
  XCircleIcon,
} from './ui/icons';
import { Card } from './ui/card';

const OPEN_KEY = 'wa-activity-log-open';

type ActivityLogProps = {
  entries: ActivityEntry[];
  onClear: () => void;
  hydrated?: boolean;
};

function ToneIcon({ tone }: { tone: ActivityTone }) {
  if (tone === 'success') {
    return <CheckCircleIcon className="h-4 w-4 shrink-0 text-primary" />;
  }
  if (tone === 'error') {
    return <XCircleIcon className="h-4 w-4 shrink-0 text-error" />;
  }
  if (tone === 'warning') {
    return <InfoIcon className="h-4 w-4 shrink-0 text-warning" />;
  }
  return <InfoIcon className="h-4 w-4 shrink-0 text-info" />;
}

export function ActivityLog({
  entries,
  onClear,
  hydrated = true,
}: ActivityLogProps) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPEN_KEY);
      if (stored === 'false') {
        setOpen(false);
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const toggleOpen = () => {
    setOpen((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(OPEN_KEY, String(next));
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  };

  return (
    <Card
      accent="indigo"
      title="Activity log"
      description={
        hydrated
          ? `${entries.length} event${entries.length === 1 ? '' : 's'} · saved in this browser`
          : 'Loading saved history...'
      }
    >
      <div className="flex items-center justify-end gap-2 border-b border-border pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleOpen}
          aria-expanded={open}
        >
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          />
          {open ? 'Collapse' : 'Expand'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={entries.length === 0}
          aria-label="Clear activity log"
        >
          <TrashIcon />
          Clear
        </Button>
      </div>

      {open && (
        <div
          className="max-h-80 overflow-y-auto pt-2"
          aria-live="polite"
          aria-relevant="additions"
        >
          {!hydrated ? (
            <p className="py-6 text-center text-sm text-foreground-muted">
              Restoring activity history...
            </p>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-foreground-muted">
              No activity yet. Connection changes and lookups will appear here and
              survive page refresh.
            </p>
          ) : (
            <ul className="space-y-1">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 rounded-[var(--radius-md)] border border-transparent px-2 py-2.5 transition hover:border-border hover:bg-background"
                >
                  <ToneIcon tone={entry.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{entry.message}</p>
                    <time
                      className="text-xs text-foreground-muted"
                      dateTime={new Date(entry.timestamp).toISOString()}
                      title={formatAbsoluteTime(entry.timestamp)}
                    >
                      {formatRelativeTime(entry.timestamp)} ·{' '}
                      {formatAbsoluteTime(entry.timestamp)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
