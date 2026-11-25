'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QrCodeIcon, TrashIcon, WifiIcon } from '@/components/ui/icons';

export type AccountStatus = {
  accountId: string;
  ready: boolean;
  authenticated: boolean;
  connectedPhone: string | null;
  loadingPercent: number | null;
  qrCode?: string | null;
  qrCodeDataUrl: string | null;
  lastError: string | null;
  requiresQrScan: boolean;
  initialized: boolean;
  startupPhase?: 'idle' | 'starting' | 'waiting-qr' | 'ready' | 'error';
};

type WhatsAppAccountsCardProps = {
  accounts: AccountStatus[];
  batchChunkSize: number;
  loading: boolean;
  addingAccount: boolean;
  disconnectingId: string | null;
  onRefresh: () => void;
  onAddAccount: () => void;
  onLogout: (accountId: string) => void;
  onDelete: (accountId: string) => void;
};

type ConnectionState = 'connected' | 'scan-qr' | 'connecting' | 'not-connected';

type StatusConfig = {
  label: string;
  dotClass: string;
  badgeTone: 'success' | 'warning' | 'info' | 'neutral' | 'error';
  tabRingClass: string;
};

const STATUS_CONFIG: Record<ConnectionState, StatusConfig> = {
  connected: {
    label: 'Connected',
    dotClass: 'bg-success',
    badgeTone: 'success',
    tabRingClass: 'ring-success/30',
  },
  'scan-qr': {
    label: 'Scan QR to connect',
    dotClass: 'bg-warning',
    badgeTone: 'warning',
    tabRingClass: 'ring-warning/40',
  },
  connecting: {
    label: 'Starting...',
    dotClass: 'bg-info animate-pulse',
    badgeTone: 'info',
    tabRingClass: 'ring-info/30',
  },
  'not-connected': {
    label: 'Not connected',
    dotClass: 'bg-foreground-muted/35',
    badgeTone: 'neutral',
    tabRingClass: 'ring-border',
  },
};

function formatConnectedPhone(digits: string): string {
  const trimmed = digits.trim();
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

function getConnectionState(account: AccountStatus): ConnectionState {
  const hasQr = Boolean(account.qrCodeDataUrl || account.qrCode);
  if (account.ready && !account.requiresQrScan && !hasQr) {
    return 'connected';
  }
  if (hasQr) {
    return 'scan-qr';
  }
  if (account.requiresQrScan) {
    return 'connecting';
  }
  if (
    account.initialized ||
    account.loadingPercent !== null ||
    account.authenticated
  ) {
    return 'connecting';
  }
  return 'not-connected';
}

function getStatusConfig(account: AccountStatus): StatusConfig {
  const state = getConnectionState(account);
  if (state === 'connecting' && account.loadingPercent !== null) {
    return {
      ...STATUS_CONFIG.connecting,
      label: `Connecting ${account.loadingPercent}%`,
    };
  }
  if (state === 'not-connected' && account.lastError) {
    return {
      ...STATUS_CONFIG['not-connected'],
      label: 'Not connected',
      badgeTone: 'error',
      dotClass: 'bg-error/70',
    };
  }
  return STATUS_CONFIG[state];
}

function accountDetailMessage(account: AccountStatus): string {
  if (
    account.ready &&
    !account.requiresQrScan &&
    !account.qrCodeDataUrl &&
    !account.qrCode
  ) {
    return 'This account is connected and ready for lookups.';
  }
  if (account.qrCodeDataUrl) {
    return 'Scan the QR code with WhatsApp on your phone.';
  }
  if (account.loadingPercent !== null) {
    return `Loading WhatsApp... ${account.loadingPercent}%`;
  }
  if (
    account.startupPhase === 'starting' ||
    account.initialized ||
    account.authenticated
  ) {
    return 'Starting WhatsApp on the server. The QR code will appear shortly (may take 1-2 min on VPS).';
  }
  if (account.lastError) {
    return account.lastError;
  }
  return 'Click Refresh to start this account, or Reset if it appears stuck.';
}

function accountTabTitle(account: AccountStatus): string {
  if (account.ready && account.connectedPhone) {
    return formatConnectedPhone(account.connectedPhone);
  }
  return `Account ${account.accountId}`;
}

function tabButtonClass(active: boolean, ringClass: string) {
  return `focus-ring flex min-w-[7.5rem] flex-1 flex-col gap-1.5 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition ${
    active
      ? `bg-primary text-primary-foreground shadow-sm ring-2 ${ringClass}`
      : `border border-transparent bg-background text-foreground hover:border-border hover:bg-surface`
  }`;
}

export function WhatsAppAccountsCard({
  accounts,
  batchChunkSize,
  loading,
  addingAccount,
  disconnectingId,
  onRefresh,
  onAddAccount,
  onLogout,
  onDelete,
}: WhatsAppAccountsCardProps) {
  const readyCount = accounts.filter((account) => account.ready).length;
  const needsQrCount = accounts.filter(
    (account) => Boolean(account.qrCodeDataUrl || account.qrCode),
  ).length;
  const notConnectedCount = accounts.filter(
    (account) => getConnectionState(account) === 'not-connected',
  ).length;

  const [activeAccountId, setActiveAccountId] = useState(
    accounts[0]?.accountId ?? '1',
  );

  useEffect(() => {
    if (accounts.length === 0) {
      return;
    }

    const stillExists = accounts.some(
      (account) => account.accountId === activeAccountId,
    );
    if (!stillExists) {
      setActiveAccountId(accounts[0].accountId);
    }
  }, [accounts, activeAccountId]);

  const activeAccount =
    accounts.find((account) => account.accountId === activeAccountId) ??
    accounts[0];

  const activeStatus = activeAccount ? getStatusConfig(activeAccount) : null;

  return (
    <Card
      accent="sky"
      title="WhatsApp accounts"
      description={`Add accounts as needed. Batch rotates every ${batchChunkSize} lookups across connected numbers.`}
      icon={<WifiIcon className="h-5 w-5" />}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={readyCount > 0 ? 'success' : 'warning'}>
            {readyCount} connected
          </Badge>
          {needsQrCount > 0 && (
            <Badge tone="warning">{needsQrCount} need QR scan</Badge>
          )}
          {notConnectedCount > 0 && (
            <Badge tone="neutral">{notConnectedCount} not connected</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onAddAccount}
            loading={addingAccount}
          >
            + Add account
          </Button>
        </div>
      </div>

      <div
        className="mb-4 flex gap-2 overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface/60 p-1.5"
        role="tablist"
        aria-label="WhatsApp accounts"
      >
        {accounts.map((account) => {
          const active = account.accountId === activeAccountId;
          const status = getStatusConfig(account);
          const title = accountTabTitle(account);
          const isDeleting = disconnectingId === account.accountId;

          return (
            <div
              key={account.accountId}
              className={`relative flex min-w-[8.5rem] flex-1 items-stretch rounded-[var(--radius-md)] ${
                active ? `ring-2 ${status.tabRingClass}` : ''
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${title}, ${status.label}`}
                className={`${tabButtonClass(active, status.tabRingClass)} flex-1 pr-8 ${
                  active ? 'ring-0' : ''
                }`}
                onClick={() => setActiveAccountId(account.accountId)}
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dotClass}`}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-semibold">{title}</span>
                </div>

                <div className="flex w-full items-center justify-between gap-2 pl-4">
                  <span
                    className={`truncate text-xs font-medium ${
                      active
                        ? 'text-primary-foreground/85'
                        : status.badgeTone === 'success'
                          ? 'text-success'
                          : status.badgeTone === 'warning'
                            ? 'text-warning'
                            : status.badgeTone === 'info'
                              ? 'text-info'
                              : status.badgeTone === 'error'
                                ? 'text-error'
                                : 'text-foreground-muted'
                    }`}
                  >
                    {status.label}
                  </span>
                  {!active && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                      #{account.accountId}
                    </span>
                  )}
                </div>
              </button>

              {accounts.length > 1 && (
                <button
                  type="button"
                  title={`Delete account ${account.accountId}`}
                  aria-label={`Delete account ${account.accountId}`}
                  disabled={isDeleting}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(account.accountId);
                  }}
                  className={`focus-ring absolute right-1.5 top-1.5 rounded-[var(--radius-sm)] p-1 transition ${
                    active
                      ? 'text-primary-foreground/80 hover:bg-white/15 hover:text-primary-foreground'
                      : 'text-foreground-muted hover:bg-error-bg hover:text-error'
                  } disabled:opacity-50`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {activeAccount && activeStatus ? (
        <article
          role="tabpanel"
          className="rounded-[var(--radius-lg)] border border-border bg-background p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Account {activeAccount.accountId}
                  {activeAccount.ready && activeAccount.connectedPhone
                    ? ` · ${formatConnectedPhone(activeAccount.connectedPhone)}`
                    : ''}
                </p>
                <Badge tone={activeStatus.badgeTone}>{activeStatus.label}</Badge>
              </div>
              <p className="mt-2 text-xs text-foreground-muted">
                {accountDetailMessage(activeAccount)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {activeAccount.ready ? (
                <Button
                  variant="danger"
                  size="sm"
                  loading={disconnectingId === activeAccount.accountId}
                  onClick={() => onLogout(activeAccount.accountId)}
                >
                  LOGOUT
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={disconnectingId === activeAccount.accountId}
                  onClick={() => onLogout(activeAccount.accountId)}
                >
                  RESET
                </Button>
              )}
              {accounts.length > 1 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-error/30 text-error hover:bg-error-bg"
                  loading={disconnectingId === activeAccount.accountId}
                  onClick={() => onDelete(activeAccount.accountId)}
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {activeAccount.qrCodeDataUrl && !activeAccount.ready && (
            <div className="mt-4 rounded-[var(--radius-md)] border border-warning-border bg-warning-bg/40 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-warning">
                <QrCodeIcon className="h-4 w-4" />
                Scan QR to connect account {activeAccount.accountId}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeAccount.qrCodeDataUrl}
                alt={`QR for account ${activeAccount.accountId}`}
                className="h-48 w-48 max-w-full rounded-[var(--radius-md)] border border-border bg-white p-2"
              />
            </div>
          )}

          {!activeAccount.ready && !activeAccount.qrCodeDataUrl && (
            <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-border bg-surface px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">
                {activeAccount.initialized ||
                activeAccount.startupPhase === 'starting'
                  ? `Starting account ${activeAccount.accountId}...`
                  : `Account ${activeAccount.accountId} is not connected yet`}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                {activeAccount.lastError
                  ? activeAccount.lastError
                  : activeAccount.initialized ||
                      activeAccount.startupPhase === 'starting'
                    ? 'QR code will appear here. On VPS this can take 1-2 minutes. Use RESET if stuck.'
                    : 'Click Refresh to start. A QR code will appear when ready.'}
              </p>
            </div>
          )}

        </article>
      ) : loading ? (
        <p className="rounded-[var(--radius-lg)] border border-border bg-background p-6 text-center text-sm text-foreground-muted">
          Loading WhatsApp accounts...
        </p>
      ) : null}
    </Card>
  );
}
