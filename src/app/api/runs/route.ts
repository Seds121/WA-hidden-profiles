import { NextRequest, NextResponse } from "next/server";
import {
  createFetchRun,
  listFetchRuns,
  type FetchRunSource,
} from "@/lib/fetch-run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidSource(value: unknown): value is FetchRunSource {
  return value === "single" || value === "batch" || value === "csv";
}

export async function GET() {
  try {
    const runs = await listFetchRuns();
    return NextResponse.json({ success: true, runs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as { source?: unknown; totalCount?: unknown };
    const source = isValidSource(payload.source) ? payload.source : "batch";
    const totalCount =
      typeof payload.totalCount === "number" && payload.totalCount > 0
        ? Math.floor(payload.totalCount)
        : 1;

    const run = await createFetchRun(source, totalCount);
    return NextResponse.json({ success: true, run });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
