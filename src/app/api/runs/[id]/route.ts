import { NextRequest, NextResponse } from "next/server";
import {
  getFetchRun,
  getFetchRunResults,
  listFetchRunLogs,
} from "@/lib/fetch-run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const run = await getFetchRun(id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const results = await getFetchRunResults(id);
    const logs = await listFetchRunLogs(id);
    return NextResponse.json({ success: true, run, results, logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
