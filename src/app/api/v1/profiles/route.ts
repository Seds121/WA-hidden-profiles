import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import { listStoredProfiles } from "@/lib/profile-store";
import { absolutizeProfile, getPublicBaseUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") ?? "";
    const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const result = await listStoredProfiles({ query, page });
    const baseUrl = getPublicBaseUrl(request);

    return jsonWithCors(request, {
      success: true,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      profiles: result.profiles.map((row) => ({
        digits: row.digits,
        inputPhone: row.inputPhone,
        displayName: row.displayName,
        accountType: row.accountType,
        success: row.success,
        lastFetchedAt: row.lastFetchedAt,
        firstFetchedAt: row.firstFetchedAt,
        profile: row.profile
          ? absolutizeProfile(row.profile, baseUrl)
          : null,
      })),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list profiles";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
