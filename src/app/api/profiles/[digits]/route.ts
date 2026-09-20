import { NextRequest, NextResponse } from "next/server";
import { getStoredProfile } from "@/lib/profile-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ digits: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { digits } = await context.params;
    const record = await getStoredProfile(digits);
    if (!record) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json(record);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
