/** Multi-WhatsApp account pool configuration and batch routing. */

import {
  addRegisteredAccount,
  ensureDefaultAccount,
  getRegisteredAccountIds,
  removeRegisteredAccount,
} from "@/lib/account-registry";

export function getMaxAccounts(): number {
  const parsed = Number.parseInt(process.env.WWJS_MAX_ACCOUNTS || "20", 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(50, Math.max(1, parsed));
}

export function getAccountIds(): string[] {
  ensureDefaultAccount();
  return getRegisteredAccountIds();
}

export function registerNewAccount(): string {
  return addRegisteredAccount();
}

export function deleteRegisteredAccount(accountId: string): void {
  removeRegisteredAccount(accountId);
}

export function getBatchChunkSize(): number {
  const parsed = Number.parseInt(
    process.env.WWJS_BATCH_CHUNK_SIZE || "1000",
    10,
  );
  if (!Number.isFinite(parsed)) {
    return 1000;
  }
  return Math.min(10_000, Math.max(1, parsed));
}

/** API chunk size — keep requests under server timeout. */
export function getApiChunkSize(): number {
  const parsed = Number.parseInt(process.env.WWJS_API_CHUNK_SIZE || "25", 10);
  if (!Number.isFinite(parsed)) {
    return 25;
  }
  return Math.min(100, Math.max(5, parsed));
}

/** UI activity-log summary interval during large batches. */
export function getLogProgressInterval(): number {
  const parsed = Number.parseInt(
    process.env.WWJS_LOG_PROGRESS_INTERVAL || "10",
    10,
  );
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return Math.min(500, Math.max(1, parsed));
}

export function getBatchDelayMs(): number {
  const parsed = Number.parseInt(process.env.WWJS_BATCH_DELAY_MS || "600", 10);
  if (!Number.isFinite(parsed)) {
    return 600;
  }
  return Math.min(5_000, Math.max(200, parsed));
}

/**
 * Rotate accounts by global row index: 0–999 → account 1, 1000–1999 → account 2, etc.
 * (chunk size from WWJS_BATCH_CHUNK_SIZE, default 1000)
 */
export function pickAccountForIndex(
  globalIndex: number,
  readyAccountIds: string[],
): string | null {
  if (readyAccountIds.length === 0) {
    return null;
  }

  const chunkSize = getBatchChunkSize();
  const slot = Math.floor(globalIndex / chunkSize) % readyAccountIds.length;
  return readyAccountIds[slot];
}
