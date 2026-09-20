import "server-only";

import { ensureDatabase, getDb } from "@/lib/db";
import { QUEUE_INGEST_MAX } from "@/lib/queue-constants";
import { toInternationalDigits } from "@/lib/phone";

export { QUEUE_INGEST_MAX };

export type PhoneQueueStatus = "pending" | "processing" | "done" | "failed";

export type PhoneQueueDoc = {
  digits: string;
  inputPhone: string;
  status: PhoneQueueStatus;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type QueueCounts = {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  profiles: number;
};

export async function enqueuePhones(rawPhones: string[]): Promise<{
  accepted: number;
  skippedInvalid: number;
  skippedDuplicate: number;
}> {
  await ensureDatabase();
  const now = Date.now();
  const unique = new Map<string, string>();
  let skippedInvalid = 0;

  for (const raw of rawPhones) {
    const input = raw.trim();
    const digits = toInternationalDigits(input);
    if (!digits) {
      skippedInvalid += 1;
      continue;
    }
    if (!unique.has(digits)) {
      unique.set(digits, input);
    }
  }

  let accepted = 0;
  let skippedDuplicate = 0;
  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO phone_queue (digits, input_phone, status, error, created_at, updated_at)
     VALUES (?, ?, 'pending', NULL, ?, ?)`,
  );

  for (const [digits, inputPhone] of unique) {
    const info = insert.run(digits, inputPhone, now, now);
    if (info.changes === 0) {
      skippedDuplicate += 1;
    } else {
      accepted += 1;
    }
  }

  return { accepted, skippedInvalid, skippedDuplicate };
}

export async function getQueueCounts(): Promise<QueueCounts> {
  await ensureDatabase();
  const count = (status: string) => {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS c FROM phone_queue WHERE status = ?")
      .get(status) as { c: number };
    return Number(row.c) || 0;
  };
  const profiles = getDb()
    .prepare("SELECT COUNT(*) AS c FROM stored_profiles")
    .get() as { c: number } | undefined;

  return {
    pending: count("pending"),
    processing: count("processing"),
    done: count("done"),
    failed: count("failed"),
    profiles: Number(profiles?.c) || 0,
  };
}

export async function markCachedPendingDone(): Promise<number> {
  await ensureDatabase();
  const now = Date.now();
  const info = getDb()
    .prepare(
      `UPDATE phone_queue
       SET status = 'done', updated_at = ?, error = NULL
       WHERE status = 'pending'
         AND digits IN (SELECT digits FROM stored_profiles WHERE success = 1)`,
    )
    .run(now);
  return info.changes;
}

export async function claimPendingPhones(limit: number): Promise<PhoneQueueDoc[]> {
  await ensureDatabase();
  const rows = getDb()
    .prepare(
      `SELECT digits, input_phone, status, error, created_at, updated_at
       FROM phone_queue
       WHERE status = 'pending'
         AND digits NOT IN (SELECT digits FROM stored_profiles WHERE success = 1)
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    digits: string;
    input_phone: string;
    status: string;
    error: string | null;
    created_at: number;
    updated_at: number;
  }>;

  const now = Date.now();
  const mark = getDb().prepare(
    `UPDATE phone_queue SET status = 'processing', updated_at = ? WHERE digits = ?`,
  );
  for (const row of rows) {
    mark.run(now, row.digits);
  }

  return rows.map((row) => ({
    digits: row.digits,
    inputPhone: row.input_phone,
    status: "processing",
    error: row.error,
    createdAt: row.created_at,
    updatedAt: now,
  }));
}

export async function markPhoneDone(digits: string): Promise<void> {
  await ensureDatabase();
  getDb()
    .prepare(
      `UPDATE phone_queue SET status = 'done', error = NULL, updated_at = ? WHERE digits = ?`,
    )
    .run(Date.now(), digits);
}

export async function markPhoneFailed(
  digits: string,
  error: string,
): Promise<void> {
  await ensureDatabase();
  getDb()
    .prepare(
      `UPDATE phone_queue SET status = 'failed', error = ?, updated_at = ? WHERE digits = ?`,
    )
    .run(error, Date.now(), digits);
}
