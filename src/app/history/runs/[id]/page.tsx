'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppNav } from '@/components/app-nav';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/state-messages';

type FetchRunSummary = {
  id: string;
  name: string;
  source: string;
  totalCount: number;
  successCount: number;
  createdAt: number;
};

type FetchRunLogEntry = {
  id: number;
  seq: number;
  level: string;
  message: string;
  fromCache: boolean;
  createdAt: number;
};

export default function HistoryRunLogsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<FetchRunSummary | null>(null);
  const [logs, setLogs] = useState<FetchRunLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void params.then((value) => setRunId(value.id));
  }, [params]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: 'no-store' });
        const data: unknown = await res.json();
        if (!res.ok || typeof data !== 'object' || data === null) {
          setError('Could not load this run');
          return;
        }

        const payload = data as {
          run?: FetchRunSummary;
          logs?: FetchRunLogEntry[];
        };
        setRun(payload.run ?? null);
        setLogs(payload.logs ?? []);
      } catch {
        setError('Network error loading run');
      } finally {
        setLoading(false);
      }
    })();
  }, [runId]);

  return (
    <>
      <div className="app-shell-header border-b border-white/10 px-4 py-8 text-white md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/history/runs"
              className="text-sm text-white/70 hover:text-white"
            >
              ← Back to batch runs
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {run?.name ?? 'Run log'}
            </h1>
            {run && (
              <p className="mt-2 text-sm text-white/80">
                {run.successCount} of {run.totalCount} succeeded ·{' '}
                {new Date(run.createdAt).toLocaleString()}
              </p>
            )}
          </div>
          <AppNav />
        </div>
      </div>

      <main className="px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl">
          {loading && (
            <EmptyState
              title="Loading log"
              description="Reading saved batch log entries..."
              icon="info"
            />
          )}

          {error && <ErrorState title="Error" message={error} />}

          {!loading && !error && logs.length === 0 && (
            <EmptyState
              title="No log entries"
              description="This run has no recorded log lines yet."
            />
          )}

          {!loading && !error && logs.length > 0 && (
            <Card
              accent="sky"
              title="Full run log"
              description="Every number processed in this batch is recorded below."
            >
              <div className="max-h-[70vh] space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-3 font-mono text-xs">
                {logs.map((entry) => (
                  <p
                    key={entry.id}
                    className={
                      entry.level === 'error'
                        ? 'text-error'
                        : entry.level === 'success'
                          ? 'text-success'
                          : entry.level === 'warning'
                            ? 'text-warning'
                            : 'text-foreground-muted'
                    }
                  >
                    {entry.message}
                  </p>
                ))}
              </div>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
