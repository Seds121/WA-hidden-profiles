/**
 * In-memory profile-picture URL cache.
 * Stored on globalThis so Next.js HMR does not wipe results between reloads.
 */
const globalForCache = globalThis as typeof globalThis & {
  __whatsappProfileCache?: Map<string, string | null>;
};

function getCache(): Map<string, string | null> {
  if (!globalForCache.__whatsappProfileCache) {
    globalForCache.__whatsappProfileCache = new Map<string, string | null>();
  }
  return globalForCache.__whatsappProfileCache;
}

export function getCachedProfileUrl(phone: string): string | null | undefined {
  const cache = getCache();
  if (!cache.has(phone)) {
    return undefined;
  }
  return cache.get(phone) ?? null;
}

export function setCachedProfileUrl(phone: string, url: string | null): void {
  getCache().set(phone, url);
}

export function clearProfileCache(): void {
  getCache().clear();
}
