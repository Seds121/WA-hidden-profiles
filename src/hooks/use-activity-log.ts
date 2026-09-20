'use client';

import { useCallback, useEffect, useState } from 'react';

export type ActivityTone = 'success' | 'error' | 'info' | 'warning';

export type ActivityEntry = {
  id: string;
  tone: ActivityTone;
  message: string;
  timestamp: number;
};

const MAX_ENTRIES = 50;
const STORAGE_KEY = 'wa-profile-activity-log';

function loadStoredEntries(): ActivityEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as ActivityEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (entry) =>
          entry &&
          typeof entry.id === 'string' &&
          typeof entry.message === 'string' &&
          typeof entry.timestamp === 'number',
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function useActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEntries(loadStoredEntries());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Ignore quota / private-mode errors.
    }
  }, [entries, hydrated]);

  const log = useCallback((tone: ActivityTone, message: string) => {
    const entry: ActivityEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tone,
      message,
      timestamp: Date.now(),
    };
    setEntries((current) => [entry, ...current].slice(0, MAX_ENTRIES));
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  return { entries, log, clear, hydrated };
}

export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
