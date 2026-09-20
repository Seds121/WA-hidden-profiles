'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppNav } from '@/components/app-nav';
import { ConfirmModal } from '@/components/confirm-modal';
import { EmptyState } from '@/components/state-messages';
import { useToast } from '@/components/toast-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

function formatWhen(value: number | null): string {
  if (!value) {
    return 'Never';
  }
  return new Date(value).toLocaleString();
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Ocean');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/keys', { cache: 'no-store' });
      const json: unknown = await res.json();
      if (
        typeof json === 'object' &&
        json !== null &&
        Array.isArray((json as { keys?: unknown }).keys)
      ) {
        setKeys((json as { keys: ApiKeyRow[] }).keys);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const error =
          typeof json === 'object' &&
          json !== null &&
          typeof (json as { error?: unknown }).error === 'string'
            ? (json as { error: string }).error
            : 'Failed to create key';
        toast('error', error);
        return;
      }

      const key =
        typeof json === 'object' && json !== null
          ? (json as { key?: { key?: string } }).key?.key
          : undefined;
      if (typeof key === 'string') {
        setPlaintext(key);
        toast('success', 'API key created. Copy it now — it is shown only once.');
      }
      await loadKeys();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeId) {
      return;
    }
    setRevoking(true);
    try {
      const res = await fetch(`/api/keys/${revokeId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast('error', 'Could not revoke key');
        return;
      }
      toast('success', 'API key revoked');
      setRevokeId(null);
      await loadKeys();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <div className="app-shell-header border-b border-white/10 px-4 py-8 text-white md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              API keys
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Generate keys for Ocean (or any other app). The full key is shown
              only once. See{' '}
              <Link href="/docs" className="underline hover:text-white">
                API docs
              </Link>
              .
            </p>
          </div>
          <AppNav />
        </div>
      </div>

      <main className="px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card
            title="Create a key"
            description="Use a name like Ocean production so you can revoke it later."
          >
            <form
              onSubmit={handleCreate}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <label className="block flex-1 text-sm">
                <span className="mb-1 block text-foreground-muted">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="focus-ring w-full rounded-[var(--radius-md)] border border-border bg-background px-4 py-2.5 text-sm text-foreground"
                  placeholder="Ocean"
                />
              </label>
              <Button type="submit" variant="primary" loading={creating}>
                Generate key
              </Button>
            </form>

            {plaintext && (
              <div className="mt-4 rounded-[var(--radius-md)] border border-warning-border bg-warning-bg p-4">
                <p className="text-sm font-medium text-warning">
                  Copy this key now. It will not be shown again.
                </p>
                <code className="mt-2 block break-all rounded-[var(--radius-sm)] bg-background px-3 py-2 text-xs text-foreground">
                  {plaintext}
                </code>
                <Button
                  className="mt-3"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(plaintext);
                    toast('success', 'Copied to clipboard');
                  }}
                >
                  Copy
                </Button>
              </div>
            )}
          </Card>

          {loading && (
            <EmptyState
              title="Loading keys"
              description="Reading API keys from the database..."
              icon="info"
            />
          )}

          {!loading && keys.length === 0 && (
            <EmptyState
              title="No API keys yet"
              description="Create a key to let Ocean call /api/v1."
            />
          )}

          {!loading && keys.length > 0 && (
            <div className="flex flex-col gap-3">
              {keys.map((key) => (
                <article
                  key={key.id}
                  className="rounded-[var(--radius-lg)] border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">
                          {key.name}
                        </h3>
                        {key.revokedAt ? (
                          <Badge tone="error">Revoked</Badge>
                        ) : (
                          <Badge tone="success">Active</Badge>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-sm text-foreground-muted">
                        {key.keyPrefix}…
                      </p>
                      <p className="mt-2 text-xs text-foreground-muted">
                        Created {formatWhen(key.createdAt)} · Last used{' '}
                        {formatWhen(key.lastUsedAt)}
                      </p>
                    </div>
                    {!key.revokedAt && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRevokeId(key.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      <ConfirmModal
        open={Boolean(revokeId)}
        title="Revoke API key?"
        message="Ocean (or any other client) using this key will immediately get 401 Unauthorized."
        confirmLabel="Revoke"
        loading={revoking}
        onConfirm={() => {
          void handleRevoke();
        }}
        onCancel={() => setRevokeId(null)}
      />
    </>
  );
}
