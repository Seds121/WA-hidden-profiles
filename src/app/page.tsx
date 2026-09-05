'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ProfileResult {
  phone: string;
  success: boolean;
  hasProfilePic?: boolean;
  profilePicUrl?: string | null;
  error?: string;
  message?: string;
  fromCache?: boolean;
  resolvedPhone?: string;
  whatsappId?: string | null;
  existsOnWhatsApp?: boolean;
  name?: string | null;
  pushname?: string | null;
  shortName?: string | null;
  verifiedName?: string | null;
  displayName?: string | null;
  about?: string | null;
  isBusiness?: boolean;
  isEnterprise?: boolean;
  isWAContact?: boolean;
  isMyContact?: boolean;
  accountType?: string;
  businessDescription?: string | null;
  businessCategories?: string[];
  businessEmail?: string | null;
  businessWebsite?: string[];
  businessAddress?: string | null;
  businessTag?: string | null;
}

type BatchResult = ProfileResult;

function accountTypeBadgeClass(accountType?: string): string {
  switch (accountType) {
    case 'Business':
      return 'bg-emerald-100 text-emerald-800';
    case 'Enterprise':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function ProfileAvatar({
  phone,
  profilePicUrl,
  size = 'md',
}: {
  phone: string;
  profilePicUrl: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'lg' ? 'w-20 h-20' : size === 'sm' ? 'w-10 h-10' : 'w-16 h-16';

  return (
    <a
      href={profilePicUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group shrink-0"
      title="Open full-size image"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={profilePicUrl}
        alt={`Profile for ${phone}`}
        className={`${sizeClass} rounded-full border-2 border-gray-200 object-cover transition group-hover:border-blue-400 group-hover:shadow-md`}
        onError={(event) => {
          event.currentTarget.src = '/fallback-avatar.svg';
        }}
      />
      <span className="mt-1 block text-center text-xs text-blue-600 underline group-hover:text-blue-800">
        View image
      </span>
    </a>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="text-sm text-gray-800 wrap-break-word">{value}</dd>
    </div>
  );
}

function ProfileDetailsCard({ result }: { result: ProfileResult }) {
  const accountType = result.accountType || 'Personal';
  const showBusinessDescription =
    Boolean(result.businessDescription) &&
    result.businessDescription !== result.about;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {result.hasProfilePic && result.profilePicUrl ? (
          <ProfileAvatar
            phone={result.phone}
            profilePicUrl={result.profilePicUrl}
            size="lg"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-white text-xs text-gray-400">
            No photo
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {result.displayName || result.phone}
            </h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${accountTypeBadgeClass(accountType)}`}
            >
              {accountType}
            </span>
            {result.verifiedName && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                Verified
              </span>
            )}
            {result.fromCache && (
              <span className="text-xs text-gray-400">(cached)</span>
            )}
          </div>

          {result.displayName && result.displayName !== result.phone && (
            <p className="text-sm text-gray-500">Input: {result.phone}</p>
          )}

          <dl className="grid gap-2">
            <DetailRow label="Push name" value={result.pushname} />
            <DetailRow label="Business name" value={result.businessTag} />
            <DetailRow label="Saved name" value={result.name} />
            <DetailRow label="Verified name" value={result.verifiedName} />
            <DetailRow label="About" value={result.about} />
            {showBusinessDescription && (
              <DetailRow
                label="Business description"
                value={result.businessDescription}
              />
            )}
            <DetailRow
              label="Categories"
              value={
                result.businessCategories && result.businessCategories.length > 0
                  ? result.businessCategories.join(', ')
                  : null
              }
            />
            <DetailRow label="Email" value={result.businessEmail} />
            <DetailRow
              label="Website"
              value={
                result.businessWebsite && result.businessWebsite.length > 0
                  ? result.businessWebsite.join(', ')
                  : null
              }
            />
            <DetailRow label="Address" value={result.businessAddress} />
            <DetailRow label="Resolved as" value={result.resolvedPhone} />
            <DetailRow label="WhatsApp ID" value={result.whatsappId} />
          </dl>

          <div className="flex flex-wrap gap-2 pt-1">
            {result.existsOnWhatsApp === false && (
              <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
                Not on WhatsApp
              </span>
            )}
            {result.isMyContact && (
              <span className="rounded-md bg-indigo-100 px-2 py-1 text-xs text-indigo-800">
                In your contacts
              </span>
            )}
            {result.isBusiness && (
              <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-800">
                Business account
              </span>
            )}
            {result.isEnterprise && (
              <span className="rounded-md bg-purple-100 px-2 py-1 text-xs text-purple-800">
                Enterprise account
              </span>
            )}
            {result.success && !result.hasProfilePic && (
              <span className="rounded-md bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
                {result.message || 'No profile picture'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [clientReady, setClientReady] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [batchNumbers, setBatchNumbers] = useState('');
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [statusMessage, setStatusMessage] = useState('Checking status...');
  const [disconnecting, setDisconnecting] = useState(false);
  const statusInFlight = useRef(false);

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
        qrCodeDataUrl?: unknown;
        message?: unknown;
        error?: unknown;
        requiresQrScan?: unknown;
      };

      setClientReady(payload.ready === true);
      setQrCodeDataUrl(
        typeof payload.qrCodeDataUrl === 'string' ? payload.qrCodeDataUrl : null,
      );
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
    } finally {
      statusInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const abort = new AbortController();

    const interval = window.setInterval(() => {
      void checkStatus(abort.signal);
    }, 5000);
    const timeout = window.setTimeout(() => {
      void checkStatus(abort.signal);
    }, 0);

    return () => {
      abort.abort();
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [checkStatus]);

  const fetchProfilePicture = async (phone: string) => {
    if (!phone.trim()) {
      alert('Please enter a phone number');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/whatsapp?phone=${encodeURIComponent(phone)}`,
      );
      const data: unknown = await res.json();
      if (typeof data !== 'object' || data === null) {
        setResult({
          phone,
          success: false,
          error: 'Unexpected response from server.',
        });
        return;
      }

      const payload = data as ProfileResult & { error?: string };
      if (!res.ok && !payload.success) {
        setResult({
          phone,
          success: false,
          error: payload.error || `Request failed (${res.status})`,
        });
        return;
      }

      setResult(payload);
    } catch (error) {
      console.error('Network error:', error);
      setResult({
        phone,
        success: false,
        error: 'Network error. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBatchFetch = async () => {
    const phones = batchNumbers
      .split('\n')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (phones.length === 0) {
      alert('Please enter at least one phone number per line');
      return;
    }

    setLoading(true);
    setBatchResults([]);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetchMultiple', phones }),
      });
      const data: unknown = await res.json();
      if (typeof data !== 'object' || data === null) {
        alert('Batch fetch failed: unexpected response');
        return;
      }

      const payload = data as {
        success?: unknown;
        results?: unknown;
        error?: unknown;
      };

      if (payload.success === true && Array.isArray(payload.results)) {
        setBatchResults(payload.results as BatchResult[]);
      } else {
        const errorText =
          typeof payload.error === 'string' ? payload.error : 'Unknown error';
        alert(`Batch fetch failed: ${errorText}`);
      }
    } catch (error) {
      console.error('Batch fetch error:', error);
      alert('Network error during batch fetch');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (clearSession = true) => {
    const confirmed = window.confirm(
      clearSession
        ? 'This will log out WhatsApp on this app, delete the saved session, and clear cached profiles. You will need to scan the QR code again. Continue?'
        : 'This will restart the WhatsApp connection and clear cached profiles. Continue?',
    );
    if (!confirmed) {
      return;
    }

    setDisconnecting(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          clearSession ? { action: 'disconnect' } : { action: 'reset' },
        ),
      });
      const data: unknown = await res.json();
      const payload =
        typeof data === 'object' && data !== null
          ? (data as {
              message?: string;
              error?: string;
              ready?: boolean;
              qrCodeDataUrl?: string | null;
            })
          : {};

      setClientReady(payload.ready === true);
      setQrCodeDataUrl(
        typeof payload.qrCodeDataUrl === 'string' ? payload.qrCodeDataUrl : null,
      );
      setResult(null);
      setBatchResults([]);
      setStatusMessage(
        payload.message ||
          (clearSession
            ? 'Disconnected. Scan the QR code below to reconnect.'
            : 'Client reset. Waiting for connection...'),
      );

      await new Promise((resolve) => {
        window.setTimeout(resolve, 1_500);
      });
      await checkStatus();
    } catch (error) {
      console.error('Disconnect error:', error);
      setStatusMessage('Failed to disconnect. Try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              WhatsApp Profile Fetcher
            </h1>
            <p className="text-gray-600">
              Fetch profile pictures, names, about text, and business details
              from phone numbers
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleDisconnect(true);
            }}
            disabled={disconnecting}
            className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disconnecting
              ? 'Disconnecting...'
              : clientReady
                ? 'Logout'
                : 'Disconnect & Reconnect'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-800">
            WhatsApp Connection
            <span
              className={`inline-block w-3 h-3 rounded-full ${clientReady ? 'bg-green-500' : 'bg-yellow-500'}`}
            />
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-sm ${clientReady ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
            >
              {clientReady ? 'Connected' : 'Not connected'}
            </span>
            <span className="text-sm text-gray-600">{statusMessage}</span>
            <button
              type="button"
              onClick={() => {
                void checkStatus();
              }}
              disabled={disconnecting}
              className="text-blue-600 hover:text-blue-800 text-sm underline disabled:opacity-50"
            >
              Refresh status
            </button>
          </div>

          {!clientReady && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                Stuck on &quot;Connecting...&quot; or logged in a long time ago?
                Use <strong>Disconnect &amp; Reconnect</strong> in the top right
                corner, then scan the new QR code.
              </p>
            </div>
          )}

          {!clientReady && qrCodeDataUrl && (
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">
                Scan this QR code with your WhatsApp mobile app:
              </p>
              <div className="bg-white p-2 inline-block rounded shadow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeDataUrl}
                  alt="WhatsApp QR Code"
                  className="w-48 h-48"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Open WhatsApp → Menu → Linked Devices → Link a Device
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">
            Single Number Lookup
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void fetchProfilePicture(phoneNumber);
                }
              }}
              placeholder="Enter phone (e.g. 03110365141 or 923110365141)"
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
              disabled={!clientReady}
            />
            <button
              type="button"
              onClick={() => {
                void fetchProfilePicture(phoneNumber);
              }}
              disabled={!phoneNumber.trim() || !clientReady || loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Loading...' : 'Fetch'}
            </button>
          </div>

          {result && (
            <div className="mt-4">
              {result.success ? (
                <ProfileDetailsCard result={result} />
              ) : (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-red-600 font-medium">Error</p>
                  <p className="text-sm text-red-500 mt-1">{result.error}</p>
                  {result.resolvedPhone && (
                    <p className="text-xs text-gray-500 mt-1">
                      Looked up as {result.resolvedPhone}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">
            Batch Lookup (One per line)
          </h2>
          <textarea
            value={batchNumbers}
            onChange={(event) => setBatchNumbers(event.target.value)}
            placeholder={
              'Enter phone numbers (one per line)\ne.g.,\n03110365141\n923110365141'
            }
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            rows={5}
            disabled={!clientReady}
          />
          <button
            type="button"
            onClick={() => {
              void handleBatchFetch();
            }}
            disabled={!batchNumbers.trim() || !clientReady || loading}
            className="mt-3 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Fetching...' : 'Fetch All'}
          </button>

          {batchResults.length > 0 && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-500">
                {batchResults.length} result
                {batchResults.length === 1 ? '' : 's'}
              </p>
              {batchResults.map((row, index) => (
                <div key={`${row.phone}-${index}`}>
                  {row.success ? (
                    <ProfileDetailsCard result={row} />
                  ) : (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900">{row.phone}</p>
                        <span className="text-xs font-medium text-red-600">
                          Failed
                        </span>
                      </div>
                      <p className="text-sm text-red-500 mt-1">{row.error}</p>
                      {row.resolvedPhone && (
                        <p className="text-xs text-gray-500 mt-1">
                          Looked up as {row.resolvedPhone}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="font-semibold text-red-800">Important Disclaimer</h3>
          <ul className="text-sm text-red-600 mt-1 list-disc list-inside space-y-1">
            <li>
              This tool uses unofficial methods and violates WhatsApp&apos;s
              Terms of Service.
            </li>
            <li>
              Your WhatsApp account may be <strong>permanently banned</strong>.
            </li>
            <li>
              This is for educational purposes only -{' '}
              <strong>do not use in production</strong>.
            </li>
            <li>
              Privacy: fetching profile pictures without consent may be illegal
              in your jurisdiction.
            </li>
            <li>
              Avoid bulk lookups. Batch mode inserts a short delay between
              requests to reduce load, but it is still risky.
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
