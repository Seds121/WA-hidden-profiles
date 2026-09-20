import "server-only";

import { getStoredProfileLookup } from "@/lib/profile-db-cache";
import { isUselessErrorMessage } from "@/lib/errors";
import { toInternationalDigits } from "@/lib/phone";
import {
  type CachedProfile,
  getCachedProfile,
  isCacheComplete,
  PROFILE_CACHE_VERSION,
  setCachedProfile,
} from "@/lib/profile-cache";
import type { ProfileLookupResult } from "@/lib/profile-types";
import {
  ensureAllAccountsStarted,
  getReadyAccountIds,
  lookupProfileDetails,
} from "@/lib/whatsapp-client";

export const INVALID_PHONE_MESSAGE =
  "Invalid phone number. Use international format (+923..., +1415..., etc.) or a supported local format.";

export const NOT_READY_MESSAGE =
  "No WhatsApp account is ready. Connect at least one account and scan its QR code.";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toCachedProfile(
  result: Awaited<ReturnType<typeof lookupProfileDetails>>,
): CachedProfile {
  return {
    cacheVersion: PROFILE_CACHE_VERSION,
    profilePicUrl: result.url,
    whatsappId: result.resolvedId,
    existsOnWhatsApp: result.existsOnWhatsApp,
    name: result.name,
    pushname: result.pushname,
    shortName: result.shortName,
    verifiedName: result.verifiedName,
    displayName: result.displayName,
    about: result.about,
    isBusiness: result.isBusiness,
    isEnterprise: result.isEnterprise,
    isWAContact: result.isWAContact,
    isMyContact: result.isMyContact,
    accountType: result.accountType,
    businessDescription: result.businessProfile?.description ?? null,
    businessCategories: result.businessProfile?.categories ?? [],
    businessEmail: result.businessProfile?.email ?? null,
    businessWebsite: result.businessProfile?.website ?? [],
    businessAddress: result.businessProfile?.address ?? null,
    businessTag: result.businessProfile?.tag ?? null,
  };
}

function fromCachedProfile(
  rawPhone: string,
  digits: string,
  cached: CachedProfile,
  accountId?: string,
): ProfileLookupResult {
  return {
    phone: rawPhone,
    success: true,
    fromCache: true,
    hasProfilePic: cached.profilePicUrl !== null,
    profilePicUrl: cached.profilePicUrl,
    resolvedPhone: digits,
    whatsappId: cached.whatsappId,
    existsOnWhatsApp: cached.existsOnWhatsApp,
    name: cached.name,
    pushname: cached.pushname,
    shortName: cached.shortName,
    verifiedName: cached.verifiedName,
    displayName: cached.displayName,
    about: cached.about,
    isBusiness: cached.isBusiness,
    isEnterprise: cached.isEnterprise,
    isWAContact: cached.isWAContact,
    isMyContact: cached.isMyContact,
    accountType: cached.accountType,
    businessDescription: cached.businessDescription,
    businessCategories: cached.businessCategories,
    businessEmail: cached.businessEmail,
    businessWebsite: cached.businessWebsite,
    businessAddress: cached.businessAddress,
    businessTag: cached.businessTag,
    accountId,
    message:
      cached.profilePicUrl === null
        ? "User has no profile picture or privacy settings restrict access"
        : undefined,
  };
}

function toLookupResult(
  rawPhone: string,
  digits: string,
  result: Awaited<ReturnType<typeof lookupProfileDetails>>,
  fromCache: boolean,
  accountId?: string,
): ProfileLookupResult {
  const cached = toCachedProfile(result);
  const base: ProfileLookupResult = {
    phone: rawPhone,
    success: true,
    fromCache,
    hasProfilePic: result.url !== null,
    profilePicUrl: result.url,
    resolvedPhone: digits,
    whatsappId: result.resolvedId,
    existsOnWhatsApp: result.existsOnWhatsApp,
    name: cached.name,
    pushname: cached.pushname,
    shortName: cached.shortName,
    verifiedName: cached.verifiedName,
    displayName: cached.displayName,
    about: cached.about,
    isBusiness: cached.isBusiness,
    isEnterprise: cached.isEnterprise,
    isWAContact: cached.isWAContact,
    isMyContact: cached.isMyContact,
    accountType: cached.accountType,
    businessDescription: cached.businessDescription,
    businessCategories: cached.businessCategories,
    businessEmail: cached.businessEmail,
    businessWebsite: cached.businessWebsite,
    businessAddress: cached.businessAddress,
    businessTag: cached.businessTag,
    accountId,
  };

  if (!result.url) {
    base.message =
      "User has no profile picture or privacy settings restrict access";
  }

  return base;
}

export async function lookupProfile(
  rawPhone: string,
  forceRefresh: boolean,
  accountId: string,
): Promise<ProfileLookupResult> {
  const digits = toInternationalDigits(rawPhone);
  if (!digits) {
    return {
      phone: rawPhone,
      success: false,
      error: INVALID_PHONE_MESSAGE,
    };
  }

  if (!forceRefresh) {
    const cachedDigits = getCachedProfile(digits);
    const cachedRaw = getCachedProfile(rawPhone);
    const cached = cachedDigits !== undefined ? cachedDigits : cachedRaw;
    if (cached !== undefined && cached !== null && isCacheComplete(cached)) {
      return fromCachedProfile(rawPhone, digits, cached, accountId);
    }

    const stored = await getStoredProfileLookup(rawPhone, digits);
    if (stored) {
      const hydrated: CachedProfile = {
        cacheVersion: PROFILE_CACHE_VERSION,
        profilePicUrl: stored.profilePicUrl ?? null,
        whatsappId: stored.whatsappId ?? null,
        existsOnWhatsApp: stored.existsOnWhatsApp,
        name: stored.name,
        pushname: stored.pushname,
        shortName: stored.shortName,
        verifiedName: stored.verifiedName,
        displayName: stored.displayName,
        about: stored.about,
        isBusiness: stored.isBusiness,
        isEnterprise: stored.isEnterprise,
        isWAContact: stored.isWAContact,
        isMyContact: stored.isMyContact,
        accountType: stored.accountType,
        businessDescription: stored.businessDescription,
        businessCategories: stored.businessCategories,
        businessEmail: stored.businessEmail,
        businessWebsite: stored.businessWebsite,
        businessAddress: stored.businessAddress,
        businessTag: stored.businessTag,
      };
      setCachedProfile(rawPhone, hydrated);
      setCachedProfile(digits, hydrated);
      return { ...stored, accountId: accountId || stored.accountId };
    }
  }

  const result = await lookupProfileDetails(digits, accountId);
  const url = result.url;
  const rawError = result.error;
  const friendlyError =
    rawError && isUselessErrorMessage(rawError)
      ? `Could not fetch a profile picture for ${digits}. The number may be private, not on WhatsApp, or WhatsApp blocked the lookup.`
      : rawError;

  if (!friendlyError) {
    const cached = toCachedProfile(result);
    setCachedProfile(rawPhone, cached);
    setCachedProfile(digits, cached);
  }

  if (url) {
    return toLookupResult(rawPhone, digits, result, false, accountId);
  }

  if (friendlyError) {
    return {
      phone: rawPhone,
      success: false,
      resolvedPhone: digits,
      whatsappId: result.resolvedId,
      error: friendlyError,
      profilePicUrl: null,
      displayName: result.displayName,
      about: result.about,
      accountType: result.accountType,
      isBusiness: result.isBusiness,
      isEnterprise: result.isEnterprise,
      accountId,
    };
  }

  return toLookupResult(rawPhone, digits, result, false, accountId);
}

/** Use the requested account when ready, otherwise the first connected account. */
export function pickReadyAccount(preferredAccountId?: string | null): string | null {
  ensureAllAccountsStarted();
  const readyIds = getReadyAccountIds();
  if (readyIds.length === 0) {
    return null;
  }

  if (preferredAccountId && readyIds.includes(preferredAccountId)) {
    return preferredAccountId;
  }

  return readyIds[0];
}

export async function persistRunResults(
  runId: string | null | undefined,
  results: ProfileLookupResult[],
): Promise<void> {
  const { saveFetchResult } = await import("@/lib/fetch-run-store");
  const { saveProfileToStore } = await import("@/lib/profile-store");

  for (const result of results) {
    if (runId) {
      await saveFetchResult(runId, result);
    } else {
      await saveProfileToStore(result);
    }
    const digits = result.resolvedPhone || toInternationalDigits(result.phone);
    if (digits && result.success) {
      try {
        const { markPhoneDone } = await import("@/lib/queue-store");
        await markPhoneDone(digits);
      } catch {
        // Queue row may not exist for dashboard lookups.
      }
    }
  }
}
