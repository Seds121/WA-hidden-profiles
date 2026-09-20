import "server-only";

import crypto from "crypto";
import { getBatchDelayMs, pickAccountForIndex } from "@/lib/account-pool";
import { getErrorMessage } from "@/lib/errors";
import {
  delay,
  lookupProfile,
  NOT_READY_MESSAGE,
  persistRunResults,
} from "@/lib/lookup-profile";
import { ensureDatabase, getDb } from "@/lib/db";
import type { ProfileLookupResult } from "@/lib/profile-types";
import {
  ensureAllAccountsStarted,
  getReadyAccountIds,
  isClientReady,
} from "@/lib/whatsapp-client";

export const API_JOB_MAX_PHONES = 5_000;

export type ApiJobStatus = "queued" | "running" | "completed" | "failed";

export type ApiJobSummary = {
  jobId: string;
  status: ApiJobStatus;
  total: number;
  completed: number;
  successCount: number;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type ApiJobDetail = ApiJobSummary & {
  results: ProfileLookupResult[];
};

function makeJobId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `job-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

const globalForJobs = globalThis as typeof globalThis & {
  __apiJobQueue?: Promise<void>;
};

function enqueueJob(jobId: string): void {
  const previous = globalForJobs.__apiJobQueue ?? Promise.resolve();
  globalForJobs.__apiJobQueue = previous
    .then(() => runApiJob(jobId))
    .catch((error: unknown) => {
      console.error(`API job ${jobId} queue error:`, error);
    });
}

export async function createApiJob(
  phones: string[],
  apiKeyId: string | null,
): Promise<ApiJobSummary> {
  await ensureDatabase();
  const id = makeJobId();
  const now = Date.now();

  getDb()
    .prepare(
      `INSERT INTO api_jobs (
        id, api_key_id, status, phones_json, total_count, completed_count,
        success_count, error, created_at, updated_at, started_at, finished_at
      ) VALUES (?, ?, 'queued', ?, ?, 0, 0, NULL, ?, ?, NULL, NULL)`,
    )
    .run(id, apiKeyId, JSON.stringify(phones), phones.length, now, now);

  enqueueJob(id);

  return {
    jobId: id,
    status: "queued",
    total: phones.length,
    completed: 0,
    successCount: 0,
    error: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
}

function rowToSummary(row: {
  id: string;
  status: string;
  total_count: number;
  completed_count: number;
  success_count: number;
  error: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
}): ApiJobSummary {
  return {
    jobId: row.id,
    status: row.status as ApiJobStatus,
    total: row.total_count,
    completed: row.completed_count,
    successCount: row.success_count,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export async function getApiJob(jobId: string): Promise<ApiJobDetail | null> {
  await ensureDatabase();
  const row = getDb()
    .prepare(
      `SELECT id, status, total_count, completed_count, success_count, error,
              created_at, updated_at, started_at, finished_at
       FROM api_jobs WHERE id = ?`,
    )
    .get(jobId) as
    | {
        id: string;
        status: string;
        total_count: number;
        completed_count: number;
        success_count: number;
        error: string | null;
        created_at: number;
        updated_at: number;
        started_at: number | null;
        finished_at: number | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  const resultRows = getDb()
    .prepare(
      `SELECT result_json FROM api_job_results WHERE job_id = ? ORDER BY seq ASC`,
    )
    .all(jobId) as Array<{ result_json: string }>;

  const results: ProfileLookupResult[] = resultRows.map((item) => {
    try {
      return JSON.parse(item.result_json) as ProfileLookupResult;
    } catch {
      return {
        phone: "",
        success: false,
        error: "Corrupt stored result",
      };
    }
  });

  return {
    ...rowToSummary(row),
    results,
  };
}

async function appendJobResult(
  jobId: string,
  seq: number,
  result: ProfileLookupResult,
): Promise<void> {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO api_job_results (job_id, seq, phone, success, result_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      jobId,
      seq,
      result.phone,
      result.success ? 1 : 0,
      JSON.stringify(result),
      now,
    );

  getDb()
    .prepare(
      `UPDATE api_jobs
       SET completed_count = completed_count + 1,
           success_count = success_count + ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(result.success ? 1 : 0, now, jobId);
}

async function runApiJob(jobId: string): Promise<void> {
  await ensureDatabase();
  const job = getDb()
    .prepare(`SELECT id, phones_json, status FROM api_jobs WHERE id = ?`)
    .get(jobId) as
    | { id: string; phones_json: string; status: string }
    | undefined;

  if (!job || job.status !== "queued") {
    return;
  }

  const startedAt = Date.now();
  getDb()
    .prepare(
      `UPDATE api_jobs SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?`,
    )
    .run(startedAt, startedAt, jobId);

  let phones: string[] = [];
  try {
    const parsed: unknown = JSON.parse(job.phones_json);
    if (Array.isArray(parsed)) {
      phones = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    phones = [];
  }

  try {
    ensureAllAccountsStarted();
    const readyAccounts = getReadyAccountIds();

    for (let i = 0; i < phones.length; i += 1) {
      const rawPhone = phones[i];
      const seq = i + 1;
      const preferred =
        pickAccountForIndex(i, readyAccounts) || readyAccounts[0] || "1";
      const accountId = isClientReady(preferred)
        ? preferred
        : readyAccounts.find((id) => isClientReady(id)) || preferred;

      let result: ProfileLookupResult;
      try {
        result = await lookupProfile(rawPhone, false, accountId);
        if (
          !result.fromCache &&
          !result.reusedFromDb &&
          !isClientReady(accountId) &&
          !result.success
        ) {
          result = {
            phone: rawPhone,
            success: false,
            error: NOT_READY_MESSAGE,
            accountId,
          };
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        result = {
          phone: rawPhone,
          success: false,
          error: message.includes("not ready") ? NOT_READY_MESSAGE : message,
          accountId,
        };
      }

      await persistRunResults(null, [result]);
      await appendJobResult(jobId, seq, result);

      if (
        result.success &&
        !result.fromCache &&
        !result.reusedFromDb &&
        isClientReady(accountId)
      ) {
        await delay(getBatchDelayMs());
      }
    }

    const finishedAt = Date.now();
    getDb()
      .prepare(
        `UPDATE api_jobs SET status = 'completed', finished_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(finishedAt, finishedAt, jobId);
  } catch (error: unknown) {
    const finishedAt = Date.now();
    getDb()
      .prepare(
        `UPDATE api_jobs
         SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(getErrorMessage(error), finishedAt, finishedAt, jobId);
  }
}
