import "server-only";

import fs from "fs";
import path from "path";

const DATA_DIR =
  process.env.APP_DATA_DIR || path.join(process.cwd(), "data");

export function getDataDir(): string {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  return DATA_DIR;
}

export function getFetchesDir(): string {
  const dir = path.join(getDataDir(), "fetches");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resolveStoredImagePath(relativePath: string): string | null {
  const dataDir = getDataDir();
  const normalized = relativePath.replace(/\\/g, "/");

  const candidates = [
    path.resolve(dataDir, normalized),
    path.resolve(getFetchesDir(), normalized),
    path.resolve(dataDir, "profiles", normalized.replace(/^profiles\//, "")),
  ];

  for (const candidate of candidates) {
    if (candidate.startsWith(dataDir) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
