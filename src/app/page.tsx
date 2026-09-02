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
}

type BatchResult = ProfileResult;

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [clientReady, setClientReady] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [batchNumbers, setBatchNumbers] = useState('');
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [statusMessage, setStatusMessage] = useState('Checking status...');
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

      // Compiles, HMR, and overlapping polls drop the request. Keep the last status.
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

      setResult({
        phone: payload.phone || phone,
        success: payload.success,
        hasProfilePic: payload.hasProfilePic,
        profilePicUrl: payload.profilePicUrl,
        error: payload.error,
        message: payload.message,
        fromCache: payload.fromCache,
        resolvedPhone: payload.resolvedPhone,
      });
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

  const handleReset = async () => {
    try {
      await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      setClientReady(false);
      setQrCodeDataUrl(null);
      setResult(null);
      setBatchResults([]);
      await checkStatus();
    } catch (error) {
      console.error('Reset error:', error);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          WhatsApp Profile Fetcher
        </h1>
        <p className="text-gray-600 mb-6">
          Educational tool - fetch profile pictures from phone numbers
        </p>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-800">
            Status
            <span
              className={`inline-block w-3 h-3 rounded-full ${clientReady ? 'bg-green-500' : 'bg-yellow-500'}`}
            />
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <span
              className={`px-3 py-1 rounded-full text-sm ${clientReady ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
            >
              {clientReady ? 'Ready' : 'Connecting...'}
            </span>
            <span className="text-sm text-gray-500">{statusMessage}</span>
            <button
              type="button"
              onClick={() => {
                void checkStatus();
              }}
              className="text-blue-600 hover:text-blue-800 text-sm underline"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                void handleReset();
              }}
              className="text-red-600 hover:text-red-800 text-sm underline"
            >
              Reset Client & Clear Cache
            </button>
          </div>

          {!clientReady && qrCodeDataUrl && (
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">
                Scan this QR code with your WhatsApp mobile app:
              </p>
              <div className="bg-white p-2 inline-block rounded shadow">
                {/* WhatsApp session QR is rendered server-side as a data URL (never sent to a third-party QR API). */}
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
            <div className="mt-4 p-4 rounded-lg border border-gray-200">
              {result.success ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-green-600 font-medium">Success</span>
                    {result.fromCache && (
                      <span className="text-xs text-gray-400">(cached)</span>
                    )}
                    {result.resolvedPhone && (
                      <span className="text-xs text-gray-500">
                        looked up as {result.resolvedPhone}
                      </span>
                    )}
                  </div>
                  {result.hasProfilePic && result.profilePicUrl ? (
                    <div className="mt-2 flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={result.profilePicUrl}
                        alt={`Profile for ${result.phone}`}
                        className="w-16 h-16 rounded-full border-2 border-gray-300 object-cover"
                        onError={(event) => {
                          event.currentTarget.src = '/fallback-avatar.svg';
                        }}
                      />
                      <div>
                        <p className="text-sm text-gray-600">
                          Profile picture found for {result.phone}
                        </p>
                        <a
                          href={result.profilePicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 underline"
                        >
                          Open image
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="text-yellow-600 mt-2">
                      {result.message || 'No profile picture available'}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-red-600 font-medium">Error</p>
                  <p className="text-sm text-red-500 mt-1">{result.error}</p>
                  {result.resolvedPhone && (
                    <p className="text-xs text-gray-500 mt-1">
                      Looked up as {result.resolvedPhone}
                    </p>
                  )}
                </>
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
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">
                      Phone
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">
                      Profile Pic
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {batchResults.map((row, index) => (
                    <tr key={`${row.phone}-${index}`}>
                      <td className="px-4 py-2 text-gray-800">{row.phone}</td>
                      <td className="px-4 py-2">
                        {row.success ? (
                          <span className="text-green-600">Success</span>
                        ) : (
                          <span className="text-red-600">Failed</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {row.success && row.hasProfilePic && row.profilePicUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.profilePicUrl}
                              alt={`Profile for ${row.phone}`}
                              className="w-8 h-8 rounded-full border border-gray-300 object-cover inline-block align-middle"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                          </>
                        ) : row.success && !row.hasProfilePic ? (
                          <span className="text-gray-400">No pic</span>
                        ) : (
                          <span className="text-red-400 text-xs">{row.error}</span>
                        )}
                        {row.fromCache && (
                          <span className="text-xs text-gray-400 ml-1">
                            (cached)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
