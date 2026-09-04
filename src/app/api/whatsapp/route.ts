import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage, isUselessErrorMessage } from "@/lib/errors";
import { toInternationalDigits } from "@/lib/phone";
import {
  type CachedProfile,
  clearProfileCache,
  getCachedProfile,
  isCacheComplete,
  PROFILE_CACHE_VERSION,
  setCachedProfile,
} from "@/lib/profile-cache";
import {
  ensureClientStarted,
  getStatus,
  isClientReady,
  lookupProfileDetails,
  diagnoseProfileLookup,
  resetClient,
} from "@/lib/whatsapp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_DELAY_MS = 400;

export type ProfileLookupResult = {
  phone: string;
  success: boolean;
  fromCache?: boolean;
  hasProfilePic?: boolean;
  profilePicUrl?: string | null;
  error?: string;
  message?: string;
  resolvedPhone?: string;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const INVALID_PHONE_MESSAGE =
  "Invalid phone number. Use a local number (e.g. 03110365141) or international digits (e.g. 923110365141).";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function toCachedProfile(result: Awaited<ReturnType<typeof lookupProfileDetails>>): CachedProfile {
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
  };

  if (!result.url) {
    base.message =
      "User has no profile picture or privacy settings restrict access";
  }

  return base;
}

async function lookupProfile(
  rawPhone: string,
  forceRefresh: boolean,
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
      return fromCachedProfile(rawPhone, digits, cached);
    }
  }

  const result = await lookupProfileDetails(digits);
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
    return toLookupResult(rawPhone, digits, result, false);
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
    };
  }

  const successResult = toLookupResult(rawPhone, digits, result, false);
  return successResult;
}

function notReadyResponse() {
  return NextResponse.json(
    { error: "WhatsApp client not ready yet. Please scan QR code." },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get("phone");
    const checkStatus = searchParams.get("checkStatus") === "true";
    const forceRefresh = searchParams.get("refresh") === "true";
    const debug = searchParams.get("debug") === "true";

    if (checkStatus) {
      ensureClientStarted();
      const status = await getStatus();
      let message = "Initializing...";
      if (status.ready) {
        message = "WhatsApp client is ready";
      } else if (status.lastError) {
        message = status.lastError;
      } else if (status.qrCode || status.qrCodeDataUrl) {
        message = "Scan QR code to authenticate";
      } else if (status.authenticated) {
        message = "Authenticated, finishing setup...";
      } else if (
        typeof status.loadingPercent === "number" &&
        status.loadingPercent >= 0
      ) {
        message = `Loading WhatsApp... ${status.loadingPercent}%`;
      } else if (status.initialized) {
        message = "Connecting to WhatsApp...";
      }

      return NextResponse.json({
        ready: status.ready,
        authenticated: status.authenticated,
        loadingPercent: status.loadingPercent,
        qrCode: status.qrCode,
        qrCodeDataUrl: status.qrCodeDataUrl,
        initialized: status.initialized,
        lastError: status.lastError,
        message,
      });
    }

    if (!phone) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 },
      );
    }

    if (!toInternationalDigits(phone)) {
      return NextResponse.json(
        { error: INVALID_PHONE_MESSAGE },
        { status: 400 },
      );
    }

    ensureClientStarted();
    if (!isClientReady()) {
      return notReadyResponse();
    }

    if (debug) {
      const digits = toInternationalDigits(phone);
      if (!digits) {
        return NextResponse.json(
          { error: INVALID_PHONE_MESSAGE },
          { status: 400 },
        );
      }
      const diagnostic = await diagnoseProfileLookup(digits);
      return NextResponse.json(diagnostic);
    }

    const result = await lookupProfile(phone, forceRefresh);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const status = message.includes("not ready") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { action, phones } = body as { action?: unknown; phones?: unknown };

    if (action === "reset") {
      await resetClient();
      clearProfileCache();
      return NextResponse.json({
        success: true,
        message: "WhatsApp client reset and cache cleared successfully",
      });
    }

    if (action === "fetchMultiple") {
      if (!isStringArray(phones) || phones.length === 0) {
        return NextResponse.json(
          { error: "phones must be a non-empty array of strings" },
          { status: 400 },
        );
      }

      ensureClientStarted();
      if (!isClientReady()) {
        return notReadyResponse();
      }

      const results: ProfileLookupResult[] = [];
      for (const rawPhone of phones) {
        const result = await lookupProfile(rawPhone, false);
        results.push(result);
        if (!result.fromCache) {
          await delay(BATCH_DELAY_MS);
        }
      }

      return NextResponse.json({
        success: true,
        results,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: reset, fetchMultiple" },
      { status: 400 },
    );
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const status = message.includes("not ready") ? 503 : 500;
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status },
    );
  }
}
