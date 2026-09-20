import "server-only";

import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/data-path";
import { ensureDatabase, getDb } from "@/lib/db";
import { saveProfileToStore } from "@/lib/profile-store";
import type { ProfileLookupResult } from "@/lib/profile-types";

export type FetchRunSource = "single" | "batch" | "csv";

export type FetchRunSummary = {
  id: string;
  name: string;
  source: FetchRunSource;
  totalCount: number;
  successCount: number;
  folderPath: string;
  createdAt: number;
};

export type FetchRunLogLevel = "info" | "success" | "warning" | "error";

export type FetchRunLogEntry = {
  id: number;
  runId: string;
  seq: number;
  phone: string | null;
  level: FetchRunLogLevel;
  message: string;
  success: boolean | null;
  accountId: string | null;
  fromCache: boolean;
  createdAt: number;
};

export type FetchResultRow = {
  id: number;
  runId: string;
  phone: string;
  resolvedPhone: string | null;
  success: boolean;
  displayName: string | null;
  about: string | null;
  profilePicUrl: string | null;
  profilePicPath: string | null;
  accountId: string | null;
  error: string | null;
  metadataJson: string | null;
  createdAt: number;
};

function makeRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${stamp}-${rand}`;
}

function formatRunName(source: FetchRunSource, total: number): string {
  const label =
    source === "single"
      ? "Single lookup"
      : source === "csv"
        ? "CSV batch"
        : "Batch lookup";
  const when = new Date().toLocaleString();
  return `${label} · ${total} number${total === 1 ? "" : "s"} · ${when}`;
}

export async function createFetchRun(
  source: FetchRunSource,
  totalCount: number,
): Promise<FetchRunSummary> {
  await ensureDatabase();
  const id = makeRunId();
  const folderPath = path.join(getDataDir(), "runs", id);
  fs.mkdirSync(folderPath, { recursive: true });

  const name = formatRunName(source, totalCount);
  const createdAt = Date.now();

  getDb()
    .prepare(
      `INSERT INTO fetch_runs (id, name, source, total_count, success_count, folder_path, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(id, name, source, totalCount, folderPath, createdAt);

  fs.writeFileSync(
    path.join(folderPath, "manifest.json"),
    JSON.stringify({ id, name, source, totalCount, createdAt }, null, 2),
    "utf8",
  );

  await appendFetchRunInfoLog(
    id,
    `Run started: ${totalCount} number${totalCount === 1 ? "" : "s"} (${source})`,
  );

  return {
    id,
    name,
    source,
    totalCount,
    successCount: 0,
    folderPath,
    createdAt,
  };
}

export async function saveFetchResult(
  runId: string,
  result: ProfileLookupResult,
): Promise<FetchResultRow> {
  await ensureDatabase();
  const run = getDb()
    .prepare("SELECT * FROM fetch_runs WHERE id = ?")
    .get(runId) as
    | {
        id: string;
        folder_path: string;
        success_count: number;
      }
    | undefined;

  if (!run) {
    throw new Error(`Fetch run ${runId} not found`);
  }

  const { profilePicPath } = await saveProfileToStore(result);

  const metadata = {
    name: result.name,
    pushname: result.pushname,
    shortName: result.shortName,
    verifiedName: result.verifiedName,
    whatsappId: result.whatsappId,
    existsOnWhatsApp: result.existsOnWhatsApp,
    isBusiness: result.isBusiness,
    isEnterprise: result.isEnterprise,
    isWAContact: result.isWAContact,
    isMyContact: result.isMyContact,
    accountType: result.accountType,
    businessDescription: result.businessDescription,
    businessCategories: result.businessCategories,
    businessEmail: result.businessEmail,
    businessWebsite: result.businessWebsite,
    businessAddress: result.businessAddress,
    businessTag: result.businessTag,
    fromCache: result.fromCache,
    reusedFromDb: result.reusedFromDb,
  };

  const createdAt = Date.now();
  const insert = getDb().prepare(
    `INSERT INTO fetch_results (
      run_id, phone, resolved_phone, success, display_name, about,
      profile_pic_url, profile_pic_path, account_id, error, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const info = insert.run(
    runId,
    result.phone,
    result.resolvedPhone ?? null,
    result.success ? 1 : 0,
    result.displayName ?? null,
    result.about ?? null,
    result.profilePicUrl ?? null,
    profilePicPath,
    result.accountId ?? null,
    result.error ?? null,
    JSON.stringify(metadata),
    createdAt,
  );

  if (result.success) {
    getDb()
      .prepare(
        "UPDATE fetch_runs SET success_count = success_count + 1 WHERE id = ?",
      )
      .run(runId);
  }

  return {
    id: Number(info.lastInsertRowid),
    runId,
    phone: result.phone,
    resolvedPhone: result.resolvedPhone ?? null,
    success: result.success,
    displayName: result.displayName ?? null,
    about: result.about ?? null,
    profilePicUrl: result.profilePicUrl ?? null,
    profilePicPath,
    accountId: result.accountId ?? null,
    error: result.error ?? null,
    metadataJson: JSON.stringify(metadata),
    createdAt,
  };
}

export async function listFetchRuns(limit = 100): Promise<FetchRunSummary[]> {
  await ensureDatabase();
  const rows = getDb()
    .prepare(
      `SELECT id, name, source, total_count, success_count, folder_path, created_at
       FROM fetch_runs ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    name: string;
    source: FetchRunSource;
    total_count: number;
    success_count: number;
    folder_path: string;
    created_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    source: row.source,
    totalCount: row.total_count,
    successCount: row.success_count,
    folderPath: row.folder_path,
    createdAt: row.created_at,
  }));
}

export async function getFetchRun(runId: string): Promise<FetchRunSummary | null> {
  await ensureDatabase();
  const row = getDb()
    .prepare(
      `SELECT id, name, source, total_count, success_count, folder_path, created_at
       FROM fetch_runs WHERE id = ?`,
    )
    .get(runId) as
    | {
        id: string;
        name: string;
        source: FetchRunSource;
        total_count: number;
        success_count: number;
        folder_path: string;
        created_at: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    source: row.source,
    totalCount: row.total_count,
    successCount: row.success_count,
    folderPath: row.folder_path,
    createdAt: row.created_at,
  };
}

export async function getFetchRunResults(runId: string): Promise<FetchResultRow[]> {
  await ensureDatabase();
  const rows = getDb()
    .prepare(
      `SELECT id, run_id, phone, resolved_phone, success, display_name, about,
              profile_pic_url, profile_pic_path, account_id, error, metadata_json, created_at
       FROM fetch_results WHERE run_id = ? ORDER BY id ASC`,
    )
    .all(runId) as Array<{
    id: number;
    run_id: string;
    phone: string;
    resolved_phone: string | null;
    success: number;
    display_name: string | null;
    about: string | null;
    profile_pic_url: string | null;
    profile_pic_path: string | null;
    account_id: string | null;
    error: string | null;
    metadata_json: string | null;
    created_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    phone: row.phone,
    resolvedPhone: row.resolved_phone,
    success: row.success === 1,
    displayName: row.display_name,
    about: row.about,
    profilePicUrl: row.profile_pic_url,
    profilePicPath: row.profile_pic_path,
    accountId: row.account_id,
    error: row.error,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
  }));
}

function formatLookupLogMessage(
  seq: number,
  result: ProfileLookupResult,
  accountId?: string,
): { level: FetchRunLogLevel; message: string } {
  const label = result.resolvedPhone || result.phone;
  if (!result.success) {
    return {
      level: "error",
      message: `#${seq} ${label} — failed: ${result.error || "unknown error"}`,
    };
  }

  const name = result.displayName || result.name || "unknown";
  if (result.reusedFromDb) {
    return {
      level: "info",
      message: `#${seq} ${label} — reused from DB (${name})`,
    };
  }
  if (result.fromCache) {
    return {
      level: "info",
      message: `#${seq} ${label} — session cache (${name})`,
    };
  }

  const via = accountId ? ` via account ${accountId}` : "";
  return {
    level: "success",
    message: `#${seq} ${label} — fetched${via} (${name})`,
  };
}

export async function appendFetchRunLog(
  runId: string,
  seq: number,
  result: ProfileLookupResult,
  accountId?: string,
): Promise<FetchRunLogEntry> {
  await ensureDatabase();
  const { level, message } = formatLookupLogMessage(seq, result, accountId);
  const createdAt = Date.now();

  const info = getDb()
    .prepare(
      `INSERT INTO fetch_run_logs (
        run_id, seq, phone, level, message, success, account_id, from_cache, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      runId,
      seq,
      result.phone,
      level,
      message,
      result.success ? 1 : 0,
      accountId ?? result.accountId ?? null,
      result.fromCache || result.reusedFromDb ? 1 : 0,
      createdAt,
    );

  return {
    id: Number(info.lastInsertRowid),
    runId,
    seq,
    phone: result.phone,
    level,
    message,
    success: result.success,
    accountId: accountId ?? result.accountId ?? null,
    fromCache: Boolean(result.fromCache || result.reusedFromDb),
    createdAt,
  };
}

export async function appendFetchRunInfoLog(
  runId: string,
  message: string,
): Promise<void> {
  await ensureDatabase();
  getDb()
    .prepare(
      `INSERT INTO fetch_run_logs (
        run_id, seq, phone, level, message, success, account_id, from_cache, created_at
      ) VALUES (?, 0, NULL, 'info', ?, NULL, NULL, 0, ?)`,
    )
    .run(runId, message, Date.now());
}

export async function listFetchRunLogs(
  runId: string,
  limit = 5000,
): Promise<FetchRunLogEntry[]> {
  await ensureDatabase();
  const rows = getDb()
    .prepare(
      `SELECT id, run_id, seq, phone, level, message, success, account_id, from_cache, created_at
       FROM fetch_run_logs
       WHERE run_id = ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(runId, limit) as Array<{
    id: number;
    run_id: string;
    seq: number;
    phone: string | null;
    level: string;
    message: string;
    success: number | null;
    account_id: string | null;
    from_cache: number;
    created_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    phone: row.phone,
    level: row.level as FetchRunLogLevel,
    message: row.message,
    success: row.success === null ? null : row.success === 1,
    accountId: row.account_id,
    fromCache: row.from_cache === 1,
    createdAt: row.created_at,
  }));
}

