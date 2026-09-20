'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppNav } from '@/components/app-nav';
import {
  ProfileDetailsCard,
  type ProfileResult,
} from '@/components/profile-details-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/state-messages';
import { STORED_PROFILES_PAGE_SIZE } from '@/lib/profile-constants';

type StoredProfileSummary = {
  digits: string;
  inputPhone: string;
  displayName: string | null;
  profile?: ProfileResult;
};

type ProfilesResponse = {
  profiles: StoredProfileSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function HistoryPage() {
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const limit = STORED_PROFILES_PAGE_SIZE;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProfilesResponse | null>(null);
  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (query.trim()) {
        params.set('q', query.trim());
      }
      const res = await fetch(`/api/profiles?${params.toString()}`, {
        cache: 'no-store',
      });
      const json: unknown = await res.json();
      if (
        typeof json === 'object' &&
        json !== null &&
        Array.isArray((json as ProfilesResponse).profiles)
      ) {
        setData(json as ProfilesResponse);
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, query]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  };

  return (
    <>
      <div className="app-shell-header border-b border-white/10 px-4 py-8 text-white md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Fetched numbers
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Profile data is stored in SQLite. Each number folder only holds its
              image (
              <code className="text-white/90">
                data/profiles/&#123;number&#125;/&#123;number&#125;.jpg
              </code>
              ). {limit} numbers per page.
            </p>
          </div>
          <AppNav />
        </div>
      </div>

      <main className="px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by phone number or name..."
              className="focus-ring flex-1 rounded-[var(--radius-md)] border border-border bg-background px-4 py-2.5 text-sm text-foreground"
            />
            <Button type="submit" variant="primary">
              Search
            </Button>
            {query && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSearchInput('');
                  setQuery('');
                  setPage(1);
                }}
              >
                Clear
              </Button>
            )}
          </form>

          {data && data.total > 0 && (
            <p className="text-sm text-foreground-muted">
              Showing {(data.page - 1) * limit + 1}–
              {Math.min(data.page * limit, data.total)} of {data.total} number
              {data.total === 1 ? '' : 's'}
              {query ? ` for “${query}”` : ''} · page {data.page} of{' '}
              {data.totalPages}
            </p>
          )}

          {loading && (
            <EmptyState
              title="Loading profiles"
              description="Reading saved numbers from the server..."
              icon="info"
            />
          )}

          {!loading && data && data.profiles.length === 0 && (
            <EmptyState
              title="No saved numbers yet"
              description="Run a lookup from the main page. Each number will appear here with full details."
            />
          )}

          {!loading && data && data.profiles.length > 0 && (
            <div className="flex flex-col gap-4">
              {data.profiles.map((summary) => (
                <ProfileDetailsCard
                  key={summary.digits}
                  result={
                    summary.profile ?? {
                      phone: summary.inputPhone,
                      success: true,
                      resolvedPhone: summary.digits,
                      displayName: summary.displayName,
                    }
                  }
                />
              ))}
            </div>
          )}

          {!loading && data && data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-foreground-muted">
                Page {page} of {data.totalPages} ({limit} per page)
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() =>
                  setPage((current) => Math.min(data.totalPages, current + 1))
                }
              >
                Next
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-foreground-muted">
            <a href="/history/runs" className="text-primary hover:underline">
              View batch run logs
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
