'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppNav } from '@/components/app-nav';
import { EmptyState } from '@/components/state-messages';
import { useToast } from '@/components/toast-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type WorkerStatus = {
  running: boolean;
  phase: string;
  message: string;
  restingUntil: number | null;
  lastLiveFetches: number;
  batchSize: number;
  restMs: number;
};

type QueueResponse = {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  profiles: number;
  worker: WorkerStatus;
};

export default function QueuePage() {
  const { toast } = useToast();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [paste, setPaste] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/queue', { cache: 'no-store' });
      const json: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof json === 'object' &&
          json !== null &&
          typeof (json as { error?: unknown }).error === 'string'
            ? (json as { error: string }).error
            : 'Queue unavailable';
        setError(message);
        setData(null);
        return;
      }
      setError(null);
      setData(json as QueueResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    const phones = paste
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (phones.length === 0) {
      toast('info', 'Paste at least one phone number');
      return;
    }
    setUploading(true);
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof json === 'object' &&
          json !== null &&
          typeof (json as { error?: unknown }).error === 'string'
            ? (json as { error: string }).error
            : 'Upload failed';
        toast('error', message);
        return;
      }
      const result = json as {
        accepted?: number;
        skippedDuplicate?: number;
        skippedInvalid?: number;
      };
      toast(
        'success',
        `Queued ${result.accepted ?? 0} · duplicates ${result.skippedDuplicate ?? 0} · invalid ${result.skippedInvalid ?? 0}`,
      );
      setPaste('');
      await load();
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="app-shell-header border-b border-white/10 px-4 py-8 text-white md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Background queue
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Upload numbers into SQLite. The worker fetches 50 per linked
              WhatsApp, then rests 20 minutes — even if you close this page.
            </p>
          </div>
          <AppNav />
        </div>
      </div>

      <main className="px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {loading && (
            <EmptyState
              title="Loading queue"
              description="Loading the background queue..."
              icon="info"
            />
          )}

          {error && !loading && (
            <EmptyState title="Queue unavailable" description={error} />
          )}

          {data && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Pending', data.pending],
                  ['Processing', data.processing],
                  ['Done', data.done],
                  ['Failed', data.failed],
                  ['Profiles', data.profiles],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-[var(--radius-lg)] border border-border bg-background p-4"
                  >
                    <p className="text-xs uppercase tracking-wide text-foreground-muted">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <Card
                title="Worker"
                description="Runs on the VPS. Already-fetched numbers are skipped."
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      data.worker.phase === 'error'
                        ? 'error'
                        : data.worker.phase === 'fetching'
                          ? 'success'
                          : 'info'
                    }
                  >
                    {data.worker.phase}
                  </Badge>
                  {data.worker.running && <Badge tone="success">Running</Badge>}
                </div>
                <p className="mt-3 text-sm text-foreground">{data.worker.message}</p>
                <p className="mt-2 text-xs text-foreground-muted">
                  {data.worker.batchSize} numbers per WhatsApp account ·{' '}
                  {Math.round(data.worker.restMs / 60000)} min rest · last live
                  fetches {data.worker.lastLiveFetches}
                  {data.worker.restingUntil
                    ? ` · rest until ${new Date(data.worker.restingUntil).toLocaleTimeString()}`
                    : ''}
                </p>
              </Card>
            </>
          )}

          <Card
            title="Enqueue numbers"
            description="One number per line. For a million numbers, Ocean should POST chunks of up to 20,000 to /api/v1/queue."
          >
            <form onSubmit={handleUpload} className="space-y-3">
              <textarea
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                rows={8}
                placeholder={'+923171717883\n03331234567'}
                className="focus-ring w-full rounded-[var(--radius-md)] border border-border bg-background px-4 py-3 font-mono text-sm text-foreground"
              />
              <Button type="submit" variant="primary" loading={uploading}>
                Add to queue
              </Button>
            </form>
          </Card>
        </div>
      </main>
    </>
  );
}
