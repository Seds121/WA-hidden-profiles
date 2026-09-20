'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityLog } from '@/components/activity-log';
import { AppNav } from '@/components/app-nav';
import { ConfirmModal } from '@/components/confirm-modal';
import { LookupPanel } from '@/components/lookup-panel';
import type { ProfileResult } from '@/components/profile-details-card';
import {
  WhatsAppAccountsCard,
  type AccountStatus,
} from '@/components/whatsapp-accounts-card';
import { useToast } from '@/components/toast-provider';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useActivityLog } from '@/hooks/use-activity-log';

type BatchResult = ProfileResult;

type ConfirmState = {
  open: boolean;
  accountId: string;
  mode: 'logout' | 'reset' | 'delete';
};

export default function Home() {
  const { toast } = useToast();
  const { entries, log, clear, hydrated } = useActivityLog();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [singleLoading, setSingleLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [batchChunkSize, setBatchChunkSize] = useState(1000);
  const [apiChunkSize, setApiChunkSize] = useState(25);
  const [logProgressInterval, setLogProgressInterval] = useState(10);
  const [clientReady, setClientReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    accountId: '1',
    mode: 'logout',
  });
  const [batchNumbers, setBatchNumbers] = useState('');
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchProgress, setBatchProgress] = useState({
    total: 0,
    completed: 0,
  });

  const statusInFlight = useRef(false);
  const [addingAccount, setAddingAccount] = useState(false);

  const disconnecting = disconnectingId !== null;
  const prevConnected = useRef<boolean | null>(null);

  const anyLoading = singleLoading || batchLoading || disconnecting || addingAccount;
  const batchProgressPercent =
    batchProgress.total > 0
      ? Math.round((batchProgress.completed / batchProgress.total) * 100)
      : 0;

  const checkStatus = useCallback(async (signal?: AbortSignal) => {
    if (statusInFlight.current) {
      return;
    }

    statusInFlight.current = true;
    try {
      const res = await fetch('/api/whatsapp?checkStatus=true', {
        cache: 'no-store',
        signal,
      });
      const data: unknown = await res.json();
      if (typeof data !== 'object' || data === null) {
        setStatusMessage('Failed to check status');
        return;
      }

      const payload = data as {
        ready?: unknown;
        readyCount?: unknown;
        accounts?: unknown;
        message?: unknown;
        error?: unknown;
        batchChunkSize?: unknown;
        apiChunkSize?: unknown;
        logProgressInterval?: unknown;
      };

      const ready = payload.ready === true;
      const accountList = Array.isArray(payload.accounts)
        ? (payload.accounts as AccountStatus[])
        : [];
      setAccounts(accountList);
      setClientReady(ready);
      if (typeof payload.batchChunkSize === 'number') {
        setBatchChunkSize(payload.batchChunkSize);
      }
      if (typeof payload.apiChunkSize === 'number') {
        setApiChunkSize(payload.apiChunkSize);
      }
      if (typeof payload.logProgressInterval === 'number') {
        setLogProgressInterval(payload.logProgressInterval);
      }
      setStatusMessage(
        typeof payload.message === 'string'
          ? payload.message
          : typeof payload.error === 'string'
            ? payload.error
            : '',
      );
    } catch (error) {
      const aborted =
        signal?.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError');
      const transient =
        aborted ||
        (error instanceof TypeError && error.message === 'Failed to fetch');

      if (transient) {
        return;
      }

      console.error('Error checking status:', error);
      setStatusMessage('Failed to check status');
      log('error', 'Status check failed');
    } finally {
      setStatusLoaded(true);
      statusInFlight.current = false;
    }
  }, [log]);

  useEffect(() => {
    const abort = new AbortController();
    const pollMs = clientReady ? 5000 : 2500;

    const interval = window.setInterval(() => {
      void checkStatus(abort.signal);
    }, pollMs);
    const timeout = window.setTimeout(() => {
      void checkStatus(abort.signal);
    }, 0);

    return () => {
      abort.abort();
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [checkStatus, clientReady]);

  useEffect(() => {
    if (prevConnected.current === null) {
      prevConnected.current = clientReady;
      return;
    }
    if (prevConnected.current !== clientReady) {
      log(
        clientReady ? 'success' : 'warning',
        clientReady
          ? 'WhatsApp connection is ready'
          : 'WhatsApp disconnected or awaiting login',
      );
      prevConnected.current = clientReady;
    }
  }, [clientReady, log]);

  const createFetchRun = async (
    source: 'single' | 'batch' | 'csv',
    totalCount: number,
  ): Promise<string | null> => {
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, totalCount }),
      });
      const data: unknown = await res.json();
      if (
        typeof data === 'object' &&
        data !== null &&
        typeof (data as { run?: { id?: string } }).run?.id === 'string'
      ) {
        return (data as { run: { id: string } }).run.id;
      }
    } catch (error) {
      console.error('Failed to create fetch run:', error);
    }
    return null;
  };

  const fetchProfilePicture = async (phone: string) => {
    if (!phone.trim()) {
      toast('info', 'Please enter a phone number');
      return;
    }

    setSingleLoading(true);
    setResult(null);
    log('info', `Lookup started for ${phone.trim()}`);

    try {
      const runId = await createFetchRun('single', 1);
      const runQuery = runId ? `&runId=${encodeURIComponent(runId)}` : '';
      const res = await fetch(
        `/api/whatsapp?phone=${encodeURIComponent(phone)}${runQuery}`,
      );
      const data: unknown = await res.json();
      if (typeof data !== 'object' || data === null) {
        const error = 'Unexpected response from server.';
        setResult({ phone, success: false, error });
        log('error', `Lookup failed for ${phone.trim()}: ${error}`);
        toast('error', error);
        return;
      }

      const payload = data as ProfileResult & { error?: string };
      if (!res.ok && !payload.success) {
        const error = payload.error || `Request failed (${res.status})`;
        setResult({ phone, success: false, error });
        log('error', `Lookup failed for ${phone.trim()}: ${error}`);
        toast('error', error);
        return;
      }

      setResult(payload);
      const label = payload.displayName || payload.phone;
      log(
        'success',
        `Lookup succeeded for ${phone.trim()} (${label})`,
      );
      toast('success', `Profile loaded for ${label}`);
      if (runId) {
        log('info', `Saved to History (run log ${runId})`);
      }
    } catch (error) {
      console.error('Network error:', error);
      const message = 'Network error. Please try again.';
      setResult({ phone, success: false, error: message });
      log('error', `Lookup failed for ${phone.trim()}: network error`);
      toast('error', message);
    } finally {
      setSingleLoading(false);
    }
  };

  const handleBatchFetch = async (
    phones: string[],
    source: 'batch' | 'csv' = 'batch',
  ) => {
    if (phones.length === 0) {
      toast('info', 'Add at least one phone number');
      return;
    }

    setBatchLoading(true);
    setBatchResults([]);
    setBatchProgress({ total: phones.length, completed: 0 });
    log(
      'info',
      `Batch lookup started (${phones.length} numbers, ${batchChunkSize} per account)`,
    );

    const collected: BatchResult[] = [];
    const runId = await createFetchRun(source, phones.length);
    let lastLoggedAt = 0;

    try {
      for (let start = 0; start < phones.length; start += apiChunkSize) {
        const chunk = phones.slice(start, start + apiChunkSize);
        const res = await fetch('/api/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'fetchMultiple',
            phones: chunk,
            startIndex: start,
            runId,
          }),
        });
        const data: unknown = await res.json();
        if (typeof data !== 'object' || data === null) {
          toast('error', 'Batch fetch failed: unexpected response');
          log('error', 'Batch lookup failed: unexpected response');
          return;
        }

        const payload = data as {
          success?: unknown;
          results?: unknown;
          error?: unknown;
        };

        if (payload.success !== true || !Array.isArray(payload.results)) {
          const errorText =
            typeof payload.error === 'string' ? payload.error : 'Unknown error';
          toast('error', `Batch fetch failed: ${errorText}`);
          log('error', `Batch lookup failed: ${errorText}`);
          return;
        }

        const chunkResults = payload.results as BatchResult[];
        collected.push(...chunkResults);
        setBatchResults([...collected]);
        setBatchProgress({
          total: phones.length,
          completed: collected.length,
        });

        const completed = collected.length;
        const shouldLogProgress =
          completed - lastLoggedAt >= logProgressInterval ||
          completed === phones.length;
        if (shouldLogProgress) {
          const sliceStart = Math.max(0, lastLoggedAt);
          const recent = collected.slice(sliceStart);
          const ok = recent.filter((row) => row.success).length;
          const cached = recent.filter(
            (row) => row.reusedFromDb || row.fromCache,
          ).length;
          log(
            ok === recent.length ? 'success' : 'info',
            `Progress ${completed}/${phones.length}: +${recent.length} processed (${ok} ok${cached > 0 ? `, ${cached} cached` : ''})`,
          );
          lastLoggedAt = completed;
        }
      }

      const successCount = collected.filter((row) => row.success).length;
      log(
        successCount === collected.length ? 'success' : 'warning',
        `Batch complete: ${successCount}/${collected.length} succeeded`,
      );
      toast(
        successCount === collected.length ? 'success' : 'info',
        `Processed ${collected.length} numbers (${successCount} succeeded)`,
      );
      if (runId) {
        log('info', `Batch saved to History (run log ${runId})`);
        toast('info', 'Results saved — open History to view the folder');
      }
    } catch (error) {
      console.error('Batch fetch error:', error);
      toast('error', 'Network error during batch fetch');
      log('error', 'Batch lookup failed: network error');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleAddAccount = async () => {
    setAddingAccount(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addAccount' }),
      });
      const data: unknown = await res.json();
      const payload =
        typeof data === 'object' && data !== null
          ? (data as {
              success?: boolean;
              accounts?: AccountStatus[];
              message?: string;
              error?: string;
              accountId?: string;
            })
          : {};

      if (payload.success && Array.isArray(payload.accounts)) {
        setAccounts(payload.accounts);
        toast('success', payload.message || `Account ${payload.accountId} added`);
        log('info', `Added WhatsApp account slot ${payload.accountId}`);
      } else {
        toast('error', payload.error || 'Failed to add account');
      }
      await checkStatus();
    } catch (error) {
      console.error('Add account error:', error);
      toast('error', 'Failed to add account');
    } finally {
      setAddingAccount(false);
    }
  };

  const requestDisconnect = (accountId: string) => {
    const account = accounts.find((item) => item.accountId === accountId);
    setConfirmState({
      open: true,
      accountId,
      mode: account?.ready ? 'logout' : 'reset',
    });
  };

  const requestDeleteAccount = (accountId: string) => {
    setConfirmState({ open: true, accountId, mode: 'delete' });
  };

  const handleConfirmAccountAction = async () => {
    const { accountId, mode } = confirmState;
    setDisconnectingId(accountId);

    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'delete'
            ? { action: 'deleteAccount', accountId }
            : mode === 'reset'
              ? { action: 'reset', accountId, clearSession: true }
              : { action: 'disconnect', accountId },
        ),
      });
      const data: unknown = await res.json();
      const payload =
        typeof data === 'object' && data !== null
          ? (data as {
              message?: string;
              error?: string;
              accounts?: AccountStatus[];
              success?: boolean;
            })
          : {};

      if (!res.ok || payload.success === false) {
        toast('error', payload.error || 'Action failed');
        log('error', payload.error || 'Account action failed');
        return;
      }

      if (mode === 'delete' && Array.isArray(payload.accounts)) {
        setAccounts(payload.accounts);
      }

      setResult(null);
      setBatchResults([]);
      setBatchProgress({ total: 0, completed: 0 });
      setStatusMessage(
        payload.message ||
          (mode === 'delete'
            ? `Account ${accountId} deleted`
            : mode === 'reset'
              ? `Account ${accountId} reset. Wait for QR code.`
              : `Account ${accountId} disconnected. Scan QR to reconnect.`),
      );

      log(
        'info',
        mode === 'delete'
          ? `Deleted WhatsApp account slot ${accountId}`
          : mode === 'reset'
            ? `Reset WhatsApp account ${accountId}`
            : `Logged out WhatsApp account ${accountId}`,
      );
      toast(
        'success',
        payload.message ||
          (mode === 'delete'
            ? `Account ${accountId} deleted`
            : mode === 'reset'
              ? `Account ${accountId} reset`
              : `Account ${accountId} logged out`),
      );

      await new Promise((resolve) => {
        window.setTimeout(resolve, 1_500);
      });
      try {
        await checkStatus();
      } catch (statusError) {
        console.warn('Status refresh after account action failed:', statusError);
      }
    } catch (error) {
      console.error('Account action error:', error);
      setStatusMessage(
        confirmState.mode === 'delete'
          ? 'Failed to delete account. Try again.'
          : confirmState.mode === 'reset'
            ? 'Failed to reset account. Try again.'
            : 'Failed to disconnect. Try again.',
      );
      log(
        'error',
        confirmState.mode === 'delete'
          ? `Delete failed for account ${accountId}`
          : confirmState.mode === 'reset'
            ? `Reset failed for account ${accountId}`
            : `Disconnect failed for account ${accountId}`,
      );
      toast(
        'error',
        confirmState.mode === 'delete'
          ? 'Failed to delete account. Try again.'
          : confirmState.mode === 'reset'
            ? 'Failed to reset account. Try again.'
            : 'Failed to disconnect. Try again.',
      );
    } finally {
      setDisconnectingId(null);
      setConfirmState({ open: false, accountId: '1', mode: 'logout' });
    }
  };

  return (
    <>
      {anyLoading && (
        <div
          className="fixed inset-x-0 top-0 z-40 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur-sm"
          aria-live="polite"
        >
          <ProgressBar
            indeterminate={!batchLoading || batchProgress.total === 0}
            value={batchLoading ? batchProgressPercent : undefined}
            label={
              batchLoading && batchProgress.total > 0
                ? `Processing batch: ${batchProgress.completed} of ${batchProgress.total}`
                : disconnecting
                  ? confirmState.mode === 'delete'
                    ? 'Deleting account...'
                    : confirmState.mode === 'reset'
                      ? 'Resetting account...'
                      : 'Logging out...'
                  : 'Fetching profile...'
            }
          />
        </div>
      )}

      <div className="app-shell-header border-b border-white/10 px-4 py-8 text-white md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-white/70">
              Profile intelligence
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              WhatsApp Profile Fetcher
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
              Multi-account batch lookups with CSV import. Each number is saved
              with full profile details in History.
            </p>
          </div>
          <AppNav />
        </div>
      </div>

      <main className="px-4 pb-10 pt-6 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <WhatsAppAccountsCard
            accounts={
              accounts.length > 0
                ? accounts
                : statusLoaded
                  ? [
                      {
                        accountId: '1',
                        ready: false,
                        authenticated: false,
                        connectedPhone: null,
                        loadingPercent: null,
                        qrCodeDataUrl: null,
                        lastError: null,
                        requiresQrScan: false,
                        initialized: false,
                        startupPhase: 'idle',
                      },
                    ]
                  : []
            }
            batchChunkSize={batchChunkSize}
            loading={!statusLoaded}
            addingAccount={addingAccount}
            disconnectingId={disconnectingId}
            onRefresh={() => {
              void checkStatus();
            }}
            onAddAccount={() => {
              void handleAddAccount();
            }}
            onLogout={requestDisconnect}
            onDelete={requestDeleteAccount}
          />

          <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_24rem]">
            <LookupPanel
              clientReady={clientReady}
              phoneNumber={phoneNumber}
              onPhoneNumberChange={setPhoneNumber}
              batchNumbers={batchNumbers}
              onBatchNumbersChange={setBatchNumbers}
              singleLoading={singleLoading}
              batchLoading={batchLoading}
              result={result}
              batchResults={batchResults}
              batchProgress={batchProgress}
              onSingleFetch={() => {
                void fetchProfilePicture(phoneNumber);
              }}
              onBatchFetch={(phones, source) => {
                void handleBatchFetch(phones, source);
              }}
            />

            <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
              <ActivityLog entries={entries} onClear={clear} hydrated={hydrated} />
            </aside>
          </div>

          <Card
            accent="default"
            title="Important disclaimer"
            description="Educational use only"
          >
            <ul className="list-disc space-y-2 pl-5 text-sm text-foreground-muted">
              <li>
                This tool uses unofficial methods and violates WhatsApp&apos;s
                Terms of Service.
              </li>
              <li>
                Your WhatsApp account may be{' '}
                <strong className="text-foreground">permanently banned</strong>.
              </li>
              <li>
                For educational purposes only —{' '}
                <strong className="text-foreground">do not use in production</strong>.
              </li>
              <li>
                Fetching profile pictures without consent may be illegal in your
                jurisdiction.
              </li>
              <li>
                Avoid bulk lookups. Batch mode adds delay between requests but
                remains risky.
              </li>
            </ul>
          </Card>
        </div>
      </main>

      <ConfirmModal
        open={confirmState.open}
        title={
          confirmState.mode === 'delete'
            ? `Delete account ${confirmState.accountId}?`
            : confirmState.mode === 'reset'
              ? `Reset account ${confirmState.accountId}?`
              : `Logout account ${confirmState.accountId}?`
        }
        message={
          confirmState.mode === 'delete'
            ? 'This will log out WhatsApp, delete the saved session, and remove this account slot permanently.'
            : confirmState.mode === 'reset'
              ? 'This clears the session and restarts pairing. Use this if the account is stuck on "Starting" without a QR code.'
              : 'This will log out that WhatsApp account, delete its saved session, and require a new QR scan for that slot.'
        }
        confirmLabel={
          confirmState.mode === 'delete'
            ? 'DELETE'
            : confirmState.mode === 'reset'
              ? 'RESET'
              : 'LOGOUT'
        }
        variant="danger"
        loading={disconnecting}
        onConfirm={() => {
          void handleConfirmAccountAction();
        }}
        onCancel={() => {
          if (!disconnecting) {
            setConfirmState({ open: false, accountId: '1', mode: 'logout' });
          }
        }}
      />
    </>
  );
}
