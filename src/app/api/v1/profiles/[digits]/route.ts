import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import { getStoredProfile } from "@/lib/profile-store";
import { absolutizeProfile, getPublicBaseUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ digits: string }> };

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { digits } = await context.params;
    const record = await getStoredProfile(digits);
    if (!record) {
      return jsonWithCors(
        request,
        { error: "Profile not found" },
        { status: 404 },
      );
    }

    const baseUrl = getPublicBaseUrl(request);
    return jsonWithCors(request, {
      success: true,
      digits: record.digits,
      inputPhone: record.inputPhone,
      lastFetchedAt: record.lastFetchedAt,
      firstFetchedAt: record.firstFetchedAt,
      profile: absolutizeProfile(record.profile, baseUrl),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load profile";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
