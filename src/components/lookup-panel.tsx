'use client';

import { useRef, useState } from 'react';
import {
  ProfileDetailsCard,
  type ProfileResult,
} from '@/components/profile-details-card';
import { EmptyState, ErrorState } from '@/components/state-messages';
import { useToast } from '@/components/toast-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UserSearchIcon } from '@/components/ui/icons';
import { parsePhoneCsv, type ParsedCsvRow } from '@/lib/csv-phones';

type LookupTab = 'single' | 'batch' | 'csv';

type BatchResult = ProfileResult;

type LookupPanelProps = {
  clientReady: boolean;
  phoneNumber: string;
  onPhoneNumberChange: (value: string) => void;
  batchNumbers: string;
  onBatchNumbersChange: (value: string) => void;
  singleLoading: boolean;
  batchLoading: boolean;
  result: ProfileResult | null;
  batchResults: BatchResult[];
  batchProgress: { total: number; completed: number };
  onSingleFetch: () => void;
  onBatchFetch: (phones: string[], source?: 'batch' | 'csv') => void;
};

const tabButtonClass = (active: boolean) =>
  `focus-ring flex-1 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition ${
    active
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-foreground-muted hover:bg-background hover:text-foreground'
  }`;

export function LookupPanel({
  clientReady,
  phoneNumber,
  onPhoneNumberChange,
  batchNumbers,
  onBatchNumbersChange,
  singleLoading,
  batchLoading,
  result,
  batchResults,
  batchProgress,
  onSingleFetch,
  onBatchFetch,
}: LookupPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<LookupTab>('single');
  const [csvRows, setCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvInvalid, setCsvInvalid] = useState<ParsedCsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parsePhoneCsv(text);
      setCsvRows(parsed.valid);
      setCsvInvalid(parsed.invalid);
      setCsvFileName(file.name);
      onBatchNumbersChange(
        parsed.valid.map((row) => row.digits || row.raw).join('\n'),
      );

      if (parsed.valid.length === 0) {
        toast(
          'error',
          `No valid numbers found in ${file.name}. Check format (+92..., 03..., etc.)`,
        );
      } else {
        toast(
          'success',
          `Loaded ${parsed.valid.length} numbers from ${file.name}${
            parsed.invalid.length > 0
              ? ` (${parsed.invalid.length} invalid skipped)`
              : ''
          }`,
        );
      }
    } catch (error) {
      console.error('CSV parse error:', error);
      toast('error', 'Could not read CSV file');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const phonesFromActiveTab = (): string[] => {
    if (activeTab === 'csv') {
      return csvRows
        .map((row) => row.digits || row.raw)
        .filter((value) => value.length > 0);
    }
    return batchNumbers
      .split('\n')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  };

  return (
    <Card
      accent="indigo"
      title="Profile lookup"
      description="Single number, paste a list, or upload a CSV with international numbers."
      icon={<UserSearchIcon className="h-5 w-5" />}
    >
      <div
        className="mb-6 flex gap-2 rounded-[var(--radius-lg)] border border-border bg-background p-1"
        role="tablist"
        aria-label="Lookup mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'single'}
          className={tabButtonClass(activeTab === 'single')}
          onClick={() => setActiveTab('single')}
        >
          Single
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'batch'}
          className={tabButtonClass(activeTab === 'batch')}
          onClick={() => setActiveTab('batch')}
        >
          Multiple
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'csv'}
          className={tabButtonClass(activeTab === 'csv')}
          onClick={() => setActiveTab('csv')}
        >
          CSV upload
        </button>
      </div>

      {activeTab === 'single' ? (
        <div role="tabpanel">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={phoneNumber}
              onChange={(event) => onPhoneNumberChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSingleFetch();
                }
              }}
              placeholder="e.g. +923110365141, +14155552671"
              className="focus-ring flex-1 rounded-[var(--radius-md)] border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted"
              disabled={!clientReady || singleLoading}
              aria-label="Phone number"
            />
            <Button
              onClick={onSingleFetch}
              disabled={!phoneNumber.trim() || !clientReady}
              loading={singleLoading}
              className="sm:min-w-[7.5rem]"
            >
              Fetch profile
            </Button>
          </div>

          <div className="mt-6">
            {singleLoading && !result && (
              <EmptyState
                title="Fetching profile"
                description="Please wait while we load profile details from WhatsApp."
                icon="info"
              />
            )}
            {!singleLoading && !result && (
              <EmptyState
                title="No lookup yet"
                description="Enter a phone number above and press Fetch profile."
              />
            )}
            {result && !singleLoading && (
              <>
                {result.success ? (
                  <ProfileDetailsCard result={result} />
                ) : (
                  <ErrorState
                    title="Lookup failed"
                    message={result.error || 'Unknown error'}
                  >
                    {result.resolvedPhone && (
                      <p className="mt-2 text-xs text-foreground-muted">
                        Looked up as {result.resolvedPhone}
                      </p>
                    )}
                  </ErrorState>
                )}
              </>
            )}
          </div>
        </div>
      ) : activeTab === 'batch' ? (
        <div role="tabpanel">
          <textarea
            value={batchNumbers}
            onChange={(event) => onBatchNumbersChange(event.target.value)}
            placeholder={'+923110365141\n+14155552671\n+447911123456'}
            className="focus-ring w-full rounded-[var(--radius-md)] border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted"
            rows={6}
            disabled={!clientReady || batchLoading}
            aria-label="Batch phone numbers"
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={() => onBatchFetch(phonesFromActiveTab(), 'batch')}
              disabled={!batchNumbers.trim() || !clientReady}
              loading={batchLoading}
            >
              Fetch all
            </Button>
            {batchProgress.total > 0 && (
              <p className="text-sm text-foreground-muted" aria-live="polite">
                {batchProgress.completed} of {batchProgress.total} processed
              </p>
            )}
          </div>

          {renderBatchResults(batchLoading, batchProgress, batchResults)}
        </div>
      ) : (
        <div role="tabpanel">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleCsvUpload(file);
              }
            }}
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={batchLoading}
            >
              Choose CSV file
            </Button>
            {csvFileName && (
              <p className="text-sm text-foreground-muted self-center">
                {csvFileName} — {csvRows.length} valid numbers
                {csvInvalid.length > 0
                  ? `, ${csvInvalid.length} invalid skipped`
                  : ''}
              </p>
            )}
          </div>

          <p className="mt-3 text-xs text-foreground-muted">
            CSV can include headers (phone, mobile, number). Supports comma,
            semicolon, or tab separated files. International formats: +92...,
            +1..., 03..., etc. Excel files must be saved as CSV first.
          </p>

          {csvInvalid.length > 0 && (
            <div className="mt-4 rounded-[var(--radius-md)] border border-warning-border bg-warning-bg/30 p-3">
              <p className="text-sm font-medium text-warning">
                {csvInvalid.length} row(s) could not be parsed
              </p>
              <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-foreground-muted">
                {csvInvalid.slice(0, 20).map((row) => (
                  <li key={`invalid-${row.line}-${row.raw}`}>
                    Line {row.line}: {row.raw || '(empty)'}
                    {row.reason ? ` — ${row.reason}` : ''}
                  </li>
                ))}
              </ul>
              {csvInvalid.length > 20 && (
                <p className="mt-2 text-xs text-foreground-muted">
                  And {csvInvalid.length - 20} more invalid rows.
                </p>
              )}
            </div>
          )}

          {csvRows.length > 0 && (
            <div className="mt-4 max-h-56 overflow-auto rounded-[var(--radius-md)] border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-xs uppercase text-foreground-muted">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Input</th>
                    <th className="px-3 py-2">Normalized</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 200).map((row, index) => (
                    <tr key={`${row.digits}-${index}`} className="border-b border-border/60">
                      <td className="px-3 py-2 text-foreground-muted">{index + 1}</td>
                      <td className="px-3 py-2">{row.raw}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.digits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 200 && (
                <p className="px-3 py-2 text-xs text-foreground-muted">
                  Showing first 200 of {csvRows.length} numbers.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={() => onBatchFetch(phonesFromActiveTab(), 'csv')}
              disabled={csvRows.length === 0 || !clientReady}
              loading={batchLoading}
            >
              Fetch all from CSV
            </Button>
            {batchProgress.total > 0 && (
              <p className="text-sm text-foreground-muted" aria-live="polite">
                {batchProgress.completed} of {batchProgress.total} processed
              </p>
            )}
          </div>

          {csvRows.length > 0 && !clientReady && (
            <p className="mt-2 text-sm text-warning">
              Connect at least one WhatsApp account before fetching.
            </p>
          )}

          {renderBatchResults(batchLoading, batchProgress, batchResults)}
        </div>
      )}
    </Card>
  );
}

function renderBatchResults(
  batchLoading: boolean,
  batchProgress: { total: number; completed: number },
  batchResults: BatchResult[],
) {
  return (
    <>
      {batchLoading && batchProgress.total === 0 && (
        <div className="mt-6">
          <EmptyState
            title="Starting batch"
            description="Submitting numbers to the server..."
            icon="info"
          />
        </div>
      )}

      {batchResults.length > 0 && (
        <div className="mt-6 space-y-4">
          {batchResults.map((row, index) => (
            <div key={`${row.phone}-${index}`}>
              {row.success ? (
                <ProfileDetailsCard result={row} />
              ) : (
                <ErrorState title={row.phone} message={row.error || 'Lookup failed'}>
                  {row.resolvedPhone && (
                    <p className="mt-2 text-xs text-foreground-muted">
                      Looked up as {row.resolvedPhone}
                      {row.accountId ? ` · account ${row.accountId}` : ''}
                    </p>
                  )}
                </ErrorState>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

