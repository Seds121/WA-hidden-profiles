'use client';

import { Button } from './ui/button';
import { QrCodeIcon, WifiIcon } from './ui/icons';
import { Skeleton } from './ui/skeleton';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

type ConnectionStatusCardProps = {
  loading: boolean;
  connected: boolean;
  statusMessage: string;
  qrCodeDataUrl: string | null;
  disconnecting: boolean;
  onRefresh: () => void;
};

type StatusVariant = 'loading' | 'connected' | 'connecting' | 'qr' | 'idle';

function resolveVariant(
  loading: boolean,
  connected: boolean,
  qrCodeDataUrl: string | null,
): StatusVariant {
  if (loading) return 'loading';
  if (connected) return 'connected';
  if (qrCodeDataUrl) return 'qr';
  return 'connecting';
}

const statusCopy: Record<
  Exclude<StatusVariant, 'loading'>,
  { label: string; badge: 'primary' | 'warning' | 'info' | 'neutral'; pulse?: boolean }
> = {
  connected: {
    label: 'Connected',
    badge: 'primary',
  },
  connecting: {
    label: 'Connecting',
    badge: 'warning',
    pulse: true,
  },
  qr: {
    label: 'Scan QR code',
    badge: 'info',
    pulse: true,
  },
  idle: {
    label: 'Not connected',
    badge: 'neutral',
  },
};

export function ConnectionStatusCard({
  loading,
  connected,
  statusMessage,
  qrCodeDataUrl,
  disconnecting,
  onRefresh,
}: ConnectionStatusCardProps) {
  const variant = resolveVariant(loading, connected, qrCodeDataUrl);
  const copy =
    variant === 'loading' ? null : statusCopy[variant === 'connecting' ? 'connecting' : variant];

  return (
    <Card
      accent="sky"
      title="WhatsApp connection"
      description="Server-side linked device status"
      icon={<WifiIcon className="h-5 w-5" />}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {loading ? (
          <div className="flex flex-1 items-start gap-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded-[var(--radius-md)]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full max-w-sm" />
              <Skeleton className="h-3 w-2/3 max-w-xs" />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-start gap-4">
            <div
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${
                variant === 'connected'
                  ? 'bg-primary-muted'
                  : variant === 'qr'
                    ? 'bg-info-bg'
                    : variant === 'connecting'
                      ? 'bg-warning-bg'
                      : 'bg-background'
              }`}
            >
              {copy?.pulse && (
                <span
                  className={`absolute inset-0 rounded-[var(--radius-md)] opacity-40 animate-[pulse-ring_1.8s_ease-in-out_infinite] ${
                    variant === 'qr' ? 'bg-info' : 'bg-warning'
                  }`}
                  aria-hidden="true"
                />
              )}
              {variant === 'qr' ? (
                <QrCodeIcon className="h-6 w-6 text-info" />
              ) : (
                <WifiIcon
                  className={`h-6 w-6 ${
                    variant === 'connected' ? 'text-primary' : 'text-foreground-muted'
                  }`}
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{copy?.label}</p>
                {copy && <Badge tone={copy.badge}>{copy.label}</Badge>}
              </div>
              <p className="mt-1 text-sm text-foreground-muted">{statusMessage}</p>
            </div>
          </div>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={loading || disconnecting}
          className="self-start"
        >
          Refresh status
        </Button>
      </div>

      {!loading && !connected && !qrCodeDataUrl && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning">
          Session stuck or expired? Use <strong>LOGOUT</strong> in the header, then scan
          the new QR code.
        </div>
      )}

      {!loading && qrCodeDataUrl && (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">
            Scan with WhatsApp mobile
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Open WhatsApp → Menu → Linked Devices → Link a Device
          </p>
          <div className="mt-4 inline-block rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-sm)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCodeDataUrl}
              alt="WhatsApp QR Code"
              className="h-48 w-48"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
