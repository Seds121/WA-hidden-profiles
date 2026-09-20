import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import {
  INVALID_PHONE_MESSAGE,
  lookupProfile,
  NOT_READY_MESSAGE,
  persistRunResults,
  pickReadyAccount,
} from "@/lib/lookup-profile";
import { toInternationalDigits } from "@/lib/phone";
import { absolutizeProfile, getPublicBaseUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return jsonWithCors(request, { error: "Invalid JSON body" }, { status: 400 });
    }

    const phone =
      typeof (body as { phone?: unknown }).phone === "string"
        ? (body as { phone: string }).phone.trim()
        : "";

    if (!phone) {
      return jsonWithCors(
        request,
        { error: "phone is required" },
        { status: 400 },
      );
    }

    if (!toInternationalDigits(phone)) {
      return jsonWithCors(
        request,
        { error: INVALID_PHONE_MESSAGE },
        { status: 400 },
      );
    }

    const forceRefresh = (body as { refresh?: unknown }).refresh === true;
    const accountId = pickReadyAccount();
    const result = await lookupProfile(phone, forceRefresh, accountId || "1");

    if (
      !result.fromCache &&
      !result.reusedFromDb &&
      !accountId &&
      !result.success
    ) {
      return jsonWithCors(
        request,
        { error: NOT_READY_MESSAGE },
        { status: 503 },
      );
    }

    await persistRunResults(null, [result]);
    const baseUrl = getPublicBaseUrl(request);
    return jsonWithCors(request, {
      success: result.success,
      profile: absolutizeProfile(result, baseUrl),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lookup failed";
    const status = message.includes("not ready") ? 503 : 500;
    return jsonWithCors(request, { error: message }, { status });
  }
}
