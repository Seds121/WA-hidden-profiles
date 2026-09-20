'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppNav } from '@/components/app-nav';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/state-messages';

type FetchRunSummary = {
  id: string;
  name: string;
  source: string;
  totalCount: number;
  successCount: number;
  createdAt: number;
};

export default function HistoryRunsPage() {
  const [runs, setRuns] = useState<FetchRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/runs', { cache: 'no-store' });
        const data: unknown = await res.json();
        if (
          typeof data === 'object' &&
          data !== null &&
          Array.isArray((data as { runs?: unknown }).runs)
        ) {
          setRuns((data as { runs: FetchRunSummary[] }).runs);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <div className="app-shell-header border-b border-white/10 px-4 py-8 text-white md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/history"
              className="text-sm text-white/70 hover:text-white"
            >
              ← Back to numbers
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Batch run logs
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Every number in a batch is logged. Open a run to see the full log.
            </p>
          </div>
          <AppNav />
        </div>
      </div>

      <main className="px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl">
          {loading && (
            <EmptyState
              title="Loading runs"
              description="Fetching batch sessions..."
              icon="info"
            />
          )}

          {!loading && runs.length === 0 && (
            <EmptyState
              title="No batch runs yet"
              description="Batch and CSV lookups create a run log you can review here."
            />
          )}

          {!loading && runs.length > 0 && (
            <div className="flex flex-col gap-3">
              {runs.map((run) => (
                <Link key={run.id} href={`/history/runs/${run.id}`}>
                  <Card
                    accent="indigo"
                    title={run.name}
                    description={new Date(run.createdAt).toLocaleString()}
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="primary">{run.source}</Badge>
                      <Badge tone="success">
                        {run.successCount}/{run.totalCount} succeeded
                      </Badge>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
