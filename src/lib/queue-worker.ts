import "server-only";

import { getBatchDelayMs } from "@/lib/account-pool";
import {
  claimPendingPhones,
  getQueueCounts,
  markCachedPendingDone,
  markPhoneDone,
  markPhoneFailed,
} from "@/lib/queue-store";
import { getErrorMessage } from "@/lib/errors";
import { delay, lookupProfile, persistRunResults } from "@/lib/lookup-profile";
import {
  ensureAllAccountsStarted,
  getReadyAccountIds,
  isClientReady,
} from "@/lib/whatsapp-client";

export function getFetchBatchSize(): number {
  const parsed = Number.parseInt(process.env.WA_FETCH_BATCH_SIZE || "50", 10);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.min(200, Math.max(1, parsed));
}

export function getFetchRestMs(): number {
  const parsed = Number.parseInt(process.env.WA_FETCH_REST_MS || "1200000", 10);
  if (!Number.isFinite(parsed)) {
    return 1_200_000;
  }
  return Math.min(3_600_000, Math.max(60_000, parsed));
}

export type QueueWorkerStatus = {
  running: boolean;
  phase: "idle" | "fetching" | "resting" | "waiting_whatsapp" | "error";
  message: string;
  restingUntil: number | null;
  lastRoundAt: number | null;
  lastLiveFetches: number;
  lastError: string | null;
  batchSize: number;
  restMs: number;
};

const globalForWorker = globalThis as typeof globalThis & {
  __queueWorkerStarted?: boolean;
  __queueWorkerStatus?: QueueWorkerStatus;
};

function status(): QueueWorkerStatus {
  if (!globalForWorker.__queueWorkerStatus) {
    globalForWorker.__queueWorkerStatus = {
      running: false,
      phase: "idle",
      message: "Worker not started",
      restingUntil: null,
      lastRoundAt: null,
      lastLiveFetches: 0,
      lastError: null,
      batchSize: getFetchBatchSize(),
      restMs: getFetchRestMs(),
    };
  }
  return globalForWorker.__queueWorkerStatus;
}

export function getQueueWorkerStatus(): QueueWorkerStatus {
  return { ...status(), batchSize: getFetchBatchSize(), restMs: getFetchRestMs() };
}

async function fetchOnAccount(
  accountId: string,
  items: Array<{ digits: string; inputPhone: string }>,
): Promise<number> {
  let live = 0;
  for (const item of items) {
    try {
      const result = await lookupProfile(item.inputPhone, false, accountId);
      await persistRunResults(null, [result]);
      if (result.success) {
        await markPhoneDone(item.digits);
      } else {
        await markPhoneFailed(item.digits, result.error || "Lookup failed");
      }
      if (!result.fromCache && !result.reusedFromDb) {
        live += 1;
        await delay(getBatchDelayMs());
      }
    } catch (error: unknown) {
      await markPhoneFailed(item.digits, getErrorMessage(error));
    }
  }
  return live;
}

async function runRound(): Promise<number> {
  const skipped = await markCachedPendingDone();
  if (skipped > 0) {
    console.info(`Queue worker: marked ${skipped} cached number(s) done`);
  }

  ensureAllAccountsStarted();
  const ready = getReadyAccountIds().filter((id) => isClientReady(id));
  if (ready.length === 0) {
    status().phase = "waiting_whatsapp";
    status().message =
      "Waiting for a WhatsApp account to connect (scan QR in the dashboard)";
    return 0;
  }

  const batchSize = getFetchBatchSize();
  const claimed = await claimPendingPhones(batchSize * ready.length);
  if (claimed.length === 0) {
    status().phase = "idle";
    status().message = "Queue empty — waiting for new numbers";
    return 0;
  }

  status().phase = "fetching";
  status().message = `Fetching ${claimed.length} number(s) across ${ready.length} account(s)`;

  const buckets: Array<typeof claimed> = ready.map(() => []);
  claimed.forEach((item, index) => {
    buckets[index % ready.length].push(item);
  });

  const liveCounts = await Promise.all(
    ready.map((accountId, index) => fetchOnAccount(accountId, buckets[index])),
  );
  return liveCounts.reduce((sum, value) => sum + value, 0);
}

async function workerLoop(): Promise<void> {
  const state = status();
  state.running = true;

  while (true) {
    try {
      const live = await runRound();
      state.lastRoundAt = Date.now();
      state.lastLiveFetches = live;
      state.lastError = null;

      if (live > 0) {
        const restMs = getFetchRestMs();
        state.phase = "resting";
        state.restingUntil = Date.now() + restMs;
        state.message = `Resting ${Math.round(restMs / 60000)} minutes to protect WhatsApp accounts`;
        await delay(restMs);
        state.restingUntil = null;
      } else {
        const counts = await getQueueCounts().catch(() => null);
        if (counts && counts.pending === 0) {
          await delay(15_000);
        } else {
          await delay(30_000);
        }
      }
    } catch (error: unknown) {
      state.phase = "error";
      state.lastError = getErrorMessage(error);
      state.message = state.lastError;
      console.error("Queue worker error:", error);
      await delay(30_000);
    }
  }
}

export function startQueueWorker(): void {
  if (globalForWorker.__queueWorkerStarted) {
    return;
  }
  globalForWorker.__queueWorkerStarted = true;
  status().running = true;
  status().message = "Worker starting";
  void workerLoop();
}
