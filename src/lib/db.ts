import "server-only";

import fs from "fs";
import path from "path";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { getDataDir, getFetchesDir } from "@/lib/data-path";

const DB_PATH = path.join(getDataDir(), "app.db");

type SqlParams = (string | number | null | Uint8Array)[];

type RunResult = {
  changes: number;
  lastInsertRowid: number;
};

class SqlStatement {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly sql: string,
    private readonly persist: () => void,
  ) {}

  run(...params: SqlParams): RunResult {
    this.db.run(this.sql, params);
    const idRow = this.db.exec("SELECT last_insert_rowid() AS id");
    const lastInsertRowid = Number(idRow[0]?.values[0]?.[0] ?? 0);
    this.persist();
    return {
      changes: this.db.getRowsModified(),
      lastInsertRowid,
    };
  }

  get(...params: SqlParams): Record<string, unknown> | undefined {
    const stmt = this.db.prepare(this.sql);
    try {
      stmt.bind(params);
      if (stmt.step()) {
        return stmt.getAsObject() as Record<string, unknown>;
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params: SqlParams): Record<string, unknown>[] {
    const stmt = this.db.prepare(this.sql);
    const rows: Record<string, unknown>[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }
}

class AppDatabase {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly persist: () => void,
  ) {}

  prepare(sql: string): SqlStatement {
    return new SqlStatement(this.db, sql, this.persist);
  }

  exec(sql: string): void {
    this.db.run(sql);
    this.persist();
  }
}

function resolveWasmPath(): string {
  const candidates = [
    path.join(process.cwd(), "sql-wasm.wasm"),
    path.join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[1];
}

function isSqliteBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 15).toString("utf8") === "SQLite format 3";
}

function persistDatabase(db: SqlJsDatabase): void {
  const buffer = Buffer.from(db.export());
  if (!isSqliteBuffer(buffer)) {
    return;
  }
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  try {
    fs.renameSync(tmpPath, DB_PATH);
  } catch {
    fs.copyFileSync(tmpPath, DB_PATH);
    fs.rmSync(tmpPath, { force: true });
  }
}

function initSchema(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fetch_runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      folder_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fetch_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      resolved_phone TEXT,
      success INTEGER NOT NULL,
      display_name TEXT,
      about TEXT,
      profile_pic_url TEXT,
      profile_pic_path TEXT,
      account_id TEXT,
      error TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES fetch_runs(id)
    );

    CREATE TABLE IF NOT EXISTS fetch_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      phone TEXT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      success INTEGER,
      account_id TEXT,
      from_cache INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES fetch_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_fetch_results_run_id ON fetch_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_fetch_results_resolved_phone ON fetch_results(resolved_phone);
    CREATE INDEX IF NOT EXISTS idx_fetch_results_phone ON fetch_results(phone);
    CREATE INDEX IF NOT EXISTS idx_fetch_runs_created_at ON fetch_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_fetch_run_logs_run_id ON fetch_run_logs(run_id);

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

    CREATE TABLE IF NOT EXISTS api_jobs (
      id TEXT PRIMARY KEY,
      api_key_id TEXT,
      status TEXT NOT NULL,
      phones_json TEXT NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_api_jobs_created_at ON api_jobs(created_at DESC);

    CREATE TABLE IF NOT EXISTS api_job_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      phone TEXT NOT NULL,
      success INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (job_id) REFERENCES api_jobs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_api_job_results_job_id ON api_job_results(job_id);

    CREATE TABLE IF NOT EXISTS stored_profiles (
      digits TEXT PRIMARY KEY,
      input_phone TEXT NOT NULL,
      display_name TEXT,
      account_type TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      profile_folder TEXT NOT NULL,
      profile_pic_path TEXT,
      metadata_json TEXT NOT NULL,
      first_fetched_at INTEGER NOT NULL,
      last_fetched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stored_profiles_input ON stored_profiles(input_phone);
    CREATE INDEX IF NOT EXISTS idx_stored_profiles_display ON stored_profiles(display_name);
    CREATE INDEX IF NOT EXISTS idx_stored_profiles_last ON stored_profiles(last_fetched_at DESC);

    CREATE TABLE IF NOT EXISTS phone_queue (
      digits TEXT PRIMARY KEY,
      input_phone TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_phone_queue_status ON phone_queue(status);
  `);
}

const globalForDb = globalThis as typeof globalThis & {
  __appSqlite?: AppDatabase;
  __appSqliteRaw?: SqlJsDatabase;
  __appSqliteInit?: Promise<void>;
};

let appDb: AppDatabase | null = null;

export async function ensureDatabase(): Promise<void> {
  await initDatabase();
}

export async function initDatabase(): Promise<void> {
  if (appDb) {
    return;
  }

  if (globalForDb.__appSqliteInit) {
    await globalForDb.__appSqliteInit;
    return;
  }

  globalForDb.__appSqliteInit = (async () => {
    try {
    getDataDir();
    const wasmPath = resolveWasmPath();
    const SQL = await initSqlJs({
      locateFile: () => wasmPath,
    });

    let rawDb: SqlJsDatabase;
    if (fs.existsSync(DB_PATH)) {
      const existing = fs.readFileSync(DB_PATH);
      if (isSqliteBuffer(existing)) {
        rawDb = new SQL.Database(existing);
      } else {
        const brokenPath = `${DB_PATH}.invalid-${Date.now()}`;
        fs.renameSync(DB_PATH, brokenPath);
        rawDb = new SQL.Database();
      }
    } else {
      rawDb = new SQL.Database();
    }

    const persist = () => persistDatabase(rawDb);
    const wrapped = new AppDatabase(rawDb, persist);
    initSchema(wrapped);
    persist();

    appDb = wrapped;
    globalForDb.__appSqlite = wrapped;
    globalForDb.__appSqliteRaw = rawDb;
    } catch (error) {
      globalForDb.__appSqliteInit = undefined;
      throw error;
    }
  })();

  await globalForDb.__appSqliteInit;
}

export function getDb(): AppDatabase {
  if (appDb) {
    return appDb;
  }

  const cached = globalForDb.__appSqlite;
  if (cached) {
    appDb = cached;
    return cached;
  }

  throw new Error("Database not initialized. Call ensureDatabase() first.");
}

export { getDataDir, getFetchesDir };
