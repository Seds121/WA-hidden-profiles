import "server-only";

import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/data-path";
import { ensureDatabase, getDb } from "@/lib/db";
import { STORED_PROFILES_PAGE_SIZE } from "@/lib/profile-constants";
import type { ProfileLookupResult } from "@/lib/profile-types";

export type StoredProfileSummary = {
  digits: string;
  inputPhone: string;
  displayName: string | null;
  accountType: string | null;
  success: boolean;
  profilePicPath: string | null;
  lastFetchedAt: number;
  firstFetchedAt: number;
  profile?: ProfileLookupResult;
};

export type StoredProfileRecord = StoredProfileSummary & {
  profile: ProfileLookupResult;
};

export function getProfilesDir(): string {
  const dir = path.join(getDataDir(), "profiles");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getProfileFolder(digits: string): string {
  const safe = digits.replace(/\D/g, "") || "unknown";
  return path.join(getProfilesDir(), safe);
}

function profileImageFileName(digits: string, ext: "jpg" | "png"): string {
  return `${digits}.${ext}`;
}

/** Remove legacy on-disk JSON and old generic image names. Data lives in SQLite only. */
function removeStaleProfileFiles(folder: string, digits: string): void {
  for (const name of [
    "profile.json",
    `${digits}.json`,
    "profile.jpg",
    "profile.png",
  ]) {
    const filePath = path.join(folder, name);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

type StoredProfileRow = {
  digits: string;
  input_phone: string;
  display_name: string | null;
  account_type: string | null;
  success: number;
  profile_pic_path: string | null;
  first_fetched_at: number;
  last_fetched_at: number;
  metadata_json: string;
};

function profileFromRow(row: StoredProfileRow): ProfileLookupResult {
  const meta = JSON.parse(row.metadata_json) as Record<string, unknown>;

  if (
    typeof meta.phone === "string" &&
    typeof meta.success === "boolean"
  ) {
    return normalizeProfileResult({
      ...(meta as ProfileLookupResult),
      phone: row.input_phone,
      success: row.success === 1,
      resolvedPhone: row.digits,
      displayName: row.display_name ?? (meta.displayName as string) ?? null,
      accountType: row.account_type ?? (meta.accountType as string) ?? undefined,
      profilePicUrl: row.profile_pic_path
        ? `/api/media/${row.profile_pic_path}`
        : (meta.profilePicUrl as string | null) ?? null,
      hasProfilePic: Boolean(row.profile_pic_path ?? meta.hasProfilePic),
      storedImagePath: row.profile_pic_path,
    });
  }

  return normalizeProfileResult({
    phone: row.input_phone,
    success: row.success === 1,
    resolvedPhone: row.digits,
    displayName: row.display_name,
    accountType: row.account_type ?? undefined,
    profilePicUrl: row.profile_pic_path
      ? `/api/media/${row.profile_pic_path}`
      : null,
    hasProfilePic: Boolean(row.profile_pic_path),
    storedImagePath: row.profile_pic_path,
    name: (meta.name as string) ?? null,
    pushname: (meta.pushname as string) ?? null,
    shortName: (meta.shortName as string) ?? null,
    verifiedName: (meta.verifiedName as string) ?? null,
    about: (meta.about as string) ?? null,
    whatsappId: (meta.whatsappId as string) ?? null,
    existsOnWhatsApp: meta.existsOnWhatsApp as boolean | undefined,
    isBusiness: meta.isBusiness as boolean | undefined,
    isEnterprise: meta.isEnterprise as boolean | undefined,
    isWAContact: meta.isWAContact as boolean | undefined,
    isMyContact: meta.isMyContact as boolean | undefined,
    businessDescription: (meta.businessDescription as string) ?? null,
    businessCategories: (meta.businessCategories as string[]) ?? [],
    businessEmail: (meta.businessEmail as string) ?? null,
    businessWebsite: normalizeWebsites(meta.businessWebsite),
    businessAddress: (meta.businessAddress as string) ?? null,
    businessTag: (meta.businessTag as string) ?? null,
    fromCache: meta.fromCache as boolean | undefined,
    reusedFromDb: meta.reusedFromDb as boolean | undefined,
    error: (meta.error as string) ?? undefined,
    message: (meta.message as string) ?? undefined,
    accountId: (meta.accountId as string) ?? undefined,
  });
}

function normalizeWebsites(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        if (typeof record.url === "string") {
          return record.url.trim();
        }
        if (typeof record.link === "string") {
          return record.link.trim();
        }
      }
      return "";
    })
    .filter((item) => item.length > 0);
}

function normalizeProfileResult(
  result: ProfileLookupResult,
): ProfileLookupResult {
  return {
    ...result,
    businessWebsite: normalizeWebsites(result.businessWebsite),
  };
}

async function downloadProfileImage(
  url: string,
  destPath: string,
): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      return false;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch {
    return false;
  }
}

function initStoredProfilesSchema(): void {
  getDb().exec(`
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
  `);
}

export async function saveProfileToStore(
  result: ProfileLookupResult,
): Promise<{ digits: string; profilePicPath: string | null }> {
  await ensureDatabase();
  initStoredProfilesSchema();

  const normalized = normalizeProfileResult(result);
  const digits =
    normalized.resolvedPhone?.replace(/\D/g, "") ||
    normalized.phone.replace(/\D/g, "") ||
    "unknown";
  const folder = getProfileFolder(digits);
  fs.mkdirSync(folder, { recursive: true });
  removeStaleProfileFiles(folder, digits);

  let profilePicPath: string | null = null;
  const ext: "jpg" | "png" =
    normalized.profilePicUrl?.includes(".png") ||
    normalized.storedImagePath?.endsWith(".png")
      ? "png"
      : "jpg";
  const imageFileName = profileImageFileName(digits, ext);
  const absoluteImagePath = path.join(folder, imageFileName);

  if (normalized.storedImagePath) {
    const fromData = path.resolve(getDataDir(), normalized.storedImagePath);
    const fromProfiles = path.join(getProfilesDir(), normalized.storedImagePath);
    const source = fs.existsSync(fromData)
      ? fromData
      : fs.existsSync(fromProfiles)
        ? fromProfiles
        : null;
    if (source) {
      try {
        fs.copyFileSync(source, absoluteImagePath);
        profilePicPath = `profiles/${digits}/${imageFileName}`;
      } catch {
        profilePicPath = null;
      }
    }
  } else if (normalized.success && normalized.profilePicUrl) {
    const saved = await downloadProfileImage(
      normalized.profilePicUrl,
      absoluteImagePath,
    );
    if (saved) {
      profilePicPath = `profiles/${digits}/${imageFileName}`;
    }
  }

  const profileForStore: ProfileLookupResult = {
    ...normalized,
    hasProfilePic: Boolean(profilePicPath || normalized.profilePicUrl),
    profilePicUrl: profilePicPath
      ? `/api/media/${profilePicPath}`
      : normalized.profilePicUrl,
    storedImagePath: profilePicPath,
    resolvedPhone: digits,
  };

  const now = Date.now();
  const existing = getDb()
    .prepare("SELECT first_fetched_at FROM stored_profiles WHERE digits = ?")
    .get(digits) as { first_fetched_at: number } | undefined;

  getDb()
    .prepare(
      `INSERT INTO stored_profiles (
        digits, input_phone, display_name, account_type, success,
        profile_folder, profile_pic_path, metadata_json,
        first_fetched_at, last_fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(digits) DO UPDATE SET
        input_phone = excluded.input_phone,
        display_name = excluded.display_name,
        account_type = excluded.account_type,
        success = excluded.success,
        profile_folder = excluded.profile_folder,
        profile_pic_path = excluded.profile_pic_path,
        metadata_json = excluded.metadata_json,
        last_fetched_at = excluded.last_fetched_at`,
    )
    .run(
      digits,
      profileForStore.phone,
      profileForStore.displayName ?? null,
      profileForStore.accountType ?? null,
      profileForStore.success ? 1 : 0,
      folder,
      profilePicPath,
      JSON.stringify(profileForStore),
      existing?.first_fetched_at ?? now,
      now,
    );

  return { digits, profilePicPath };
}

export async function listStoredProfiles(options?: {
  query?: string;
  page?: number;
  limit?: number;
}): Promise<{
  profiles: StoredProfileSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  await ensureDatabase();
  initStoredProfilesSchema();

  const page = Math.max(1, options?.page ?? 1);
  const limit = STORED_PROFILES_PAGE_SIZE;
  const offset = (page - 1) * limit;
  const query = options?.query?.trim() ?? "";

  let where = "";
  const params: (string | number)[] = [];

  if (query) {
    const digits = query.replace(/\D/g, "");
    where = `WHERE digits LIKE ? OR input_phone LIKE ? OR display_name LIKE ?${
      digits ? " OR digits LIKE ?" : ""
    }`;
    const like = `%${query}%`;
    params.push(like, like, like);
    if (digits) {
      params.push(`%${digits}%`);
    }
  }

  const countRow = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM stored_profiles ${where}`)
    .get(...params) as { c: number };

  const rows = getDb()
    .prepare(
      `SELECT digits, input_phone, display_name, account_type, success,
              profile_pic_path, first_fetched_at, last_fetched_at, metadata_json
       FROM stored_profiles ${where}
       ORDER BY last_fetched_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as StoredProfileRow[];

  const total = countRow.c;
  return {
    profiles: rows.map((row) => {
      const profile = profileFromRow(row);

      return {
        digits: row.digits,
        inputPhone: row.input_phone,
        displayName: row.display_name,
        accountType: row.account_type,
        success: row.success === 1,
        profilePicPath: row.profile_pic_path,
        firstFetchedAt: row.first_fetched_at,
        lastFetchedAt: row.last_fetched_at,
        profile,
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getStoredProfile(
  digits: string,
): Promise<StoredProfileRecord | null> {
  const safe = digits.replace(/\D/g, "");
  await ensureDatabase();
  initStoredProfilesSchema();

  const row = getDb()
    .prepare(
      `SELECT digits, input_phone, display_name, account_type, success,
              profile_pic_path, first_fetched_at, last_fetched_at, metadata_json
       FROM stored_profiles WHERE digits = ?`,
    )
    .get(safe) as StoredProfileRow | undefined;

  if (!row) {
    return null;
  }

  const profile = profileFromRow(row);

  return {
    digits: row.digits,
    inputPhone: row.input_phone,
    displayName: row.display_name ?? profile.displayName ?? null,
    accountType: row.account_type ?? profile.accountType ?? null,
    success: row.success === 1,
    profilePicPath: row.profile_pic_path,
    firstFetchedAt: row.first_fetched_at,
    lastFetchedAt: row.last_fetched_at,
    profile,
  };
}
