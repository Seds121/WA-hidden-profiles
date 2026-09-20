import { NextRequest, NextResponse } from "next/server";
import { listStoredProfiles } from "@/lib/profile-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") ?? "";
    const page = Number.parseInt(searchParams.get("page") ?? "1", 10);

    const result = await listStoredProfiles({ query, page });
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list profiles";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
