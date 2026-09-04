/**
 * In-memory profile cache.
 * Stored on globalThis so Next.js HMR does not wipe results between reloads.
 */
export const PROFILE_CACHE_VERSION = 5;

export type CachedProfile = {
  cacheVersion?: number;
  profilePicUrl: string | null;
  whatsappId?: string | null;
  existsOnWhatsApp?: boolean;
  name?: string | null;
  pushname?: string | null;
  shortName?: string | null;
  verifiedName?: string | null;
  displayName?: string | null;
  about?: string | null;
  isBusiness?: boolean;
  isEnterprise?: boolean;
  isWAContact?: boolean;
  isMyContact?: boolean;
  accountType?: string;
  businessDescription?: string | null;
  businessCategories?: string[];
  businessEmail?: string | null;
  businessWebsite?: string[];
  businessAddress?: string | null;
  businessTag?: string | null;
};

export function isCacheComplete(cached: CachedProfile): boolean {
  return cached.cacheVersion === PROFILE_CACHE_VERSION;
}

const globalForCache = globalThis as typeof globalThis & {
  __whatsappProfileCache?: Map<string, CachedProfile | null>;
};

function getCache(): Map<string, CachedProfile | null> {
  if (!globalForCache.__whatsappProfileCache) {
    globalForCache.__whatsappProfileCache = new Map<
      string,
      CachedProfile | null
    >();
  }
  return globalForCache.__whatsappProfileCache;
}

export function getCachedProfile(
  phone: string,
): CachedProfile | null | undefined {
  const cache = getCache();
  if (!cache.has(phone)) {
    return undefined;
  }
  return cache.get(phone) ?? null;
}

export function setCachedProfile(
  phone: string,
  profile: CachedProfile | null,
): void {
  getCache().set(phone, profile);
}

export function clearProfileCache(): void {
  getCache().clear();
}
