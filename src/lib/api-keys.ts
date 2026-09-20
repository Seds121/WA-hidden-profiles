import "server-only";

import crypto from "crypto";
import { ensureDatabase, getDb } from "@/lib/db";

export type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext, "utf8").digest("hex");
}

function makeKeyId(): string {
  return `key_${crypto.randomBytes(8).toString("hex")}`;
}

function makePlaintextKey(): string {
  return `whp_${crypto.randomBytes(32).toString("hex")}`;
}

export async function createApiKey(
  name: string,
): Promise<ApiKeyRecord & { key: string }> {
  await ensureDatabase();
  const trimmed = name.trim() || "Ocean";
  const id = makeKeyId();
  const key = makePlaintextKey();
  const createdAt = Date.now();
  const prefix = key.slice(0, 12);

  getDb()
    .prepare(
      `INSERT INTO api_keys (id, name, key_hash, key_prefix, created_at, last_used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .run(id, trimmed, hashApiKey(key), prefix, createdAt);

  return {
    id,
    name: trimmed,
    keyPrefix: prefix,
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
    key,
  };
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  await ensureDatabase();
  const rows = getDb()
    .prepare(
      `SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
       FROM api_keys
       ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    key_prefix: string;
    created_at: number;
    last_used_at: number | null;
    revoked_at: number | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }));
}

export async function renameApiKey(id: string, name: string): Promise<boolean> {
  await ensureDatabase();
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  getDb()
    .prepare("UPDATE api_keys SET name = ? WHERE id = ? AND revoked_at IS NULL")
    .run(trimmed, id);
  const row = getDb()
    .prepare("SELECT id FROM api_keys WHERE id = ? AND name = ?")
    .get(id, trimmed);
  return Boolean(row);
}

export async function revokeApiKey(id: string): Promise<boolean> {
  await ensureDatabase();
  const existing = getDb()
    .prepare("SELECT id, revoked_at FROM api_keys WHERE id = ?")
    .get(id) as { id: string; revoked_at: number | null } | undefined;
  if (!existing || existing.revoked_at) {
    return false;
  }
  getDb()
    .prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ?")
    .run(Date.now(), id);
  return true;
}

export async function verifyApiKey(
  plaintext: string,
): Promise<ApiKeyRecord | null> {
  await ensureDatabase();
  const trimmed = plaintext.trim();
  if (!trimmed.startsWith("whp_")) {
    return null;
  }

  const row = getDb()
    .prepare(
      `SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
       FROM api_keys
       WHERE key_hash = ?`,
    )
    .get(hashApiKey(trimmed)) as
    | {
        id: string;
        name: string;
        key_prefix: string;
        created_at: number;
        last_used_at: number | null;
        revoked_at: number | null;
      }
    | undefined;

  if (!row || row.revoked_at) {
    return null;
  }

  getDb()
    .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
    .run(Date.now(), row.id);

  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: Date.now(),
    revokedAt: null,
  };
}
