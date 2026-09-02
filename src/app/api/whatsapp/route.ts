import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage, isUselessErrorMessage } from "@/lib/errors";
import { toInternationalDigits } from "@/lib/phone";
import {
  clearProfileCache,
  getCachedProfileUrl,
  setCachedProfileUrl,
} from "@/lib/profile-cache";
import {
  ensureClientStarted,
  getStatus,
  isClientReady,
  lookupProfilePicture,
  resetClient,
} from "@/lib/whatsapp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_DELAY_MS = 400;

type ProfileLookupResult = {
  phone: string;
  success: boolean;
  fromCache?: boolean;
  hasProfilePic?: boolean;
  profilePicUrl?: string | null;
  error?: string;
  message?: string;
  resolvedPhone?: string;
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
    const cachedDigits = getCachedProfileUrl(digits);
    const cachedRaw = getCachedProfileUrl(rawPhone);
    const cached = cachedDigits !== undefined ? cachedDigits : cachedRaw;
    if (cached !== undefined) {
      return {
        phone: rawPhone,
        success: true,
        fromCache: true,
        hasProfilePic: cached !== null,
        profilePicUrl: cached,
        resolvedPhone: digits,
        message:
          cached === null
            ? "User has no profile picture or privacy settings restrict access"
            : undefined,
      };
    }
  }

  const result = await lookupProfilePicture(digits);
  const url = result.url;
  const rawError = result.error;
  const friendlyError =
    rawError && isUselessErrorMessage(rawError)
      ? `Could not fetch a profile picture for ${digits}. The number may be private, not on WhatsApp, or WhatsApp blocked the lookup.`
      : rawError;

  if (!friendlyError) {
    setCachedProfileUrl(rawPhone, url);
    setCachedProfileUrl(digits, url);
  }

  if (url) {
    return {
      phone: rawPhone,
      success: true,
      fromCache: false,
      hasProfilePic: true,
      profilePicUrl: url,
      resolvedPhone: digits,
    };
  }

  if (friendlyError) {
    return {
      phone: rawPhone,
      success: false,
      resolvedPhone: digits,
      error: friendlyError,
      profilePicUrl: null,
    };
  }

  return {
    phone: rawPhone,
    success: true,
    fromCache: false,
    hasProfilePic: false,
    profilePicUrl: null,
    resolvedPhone: digits,
    message: "User has no profile picture or privacy settings restrict access",
  };
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
