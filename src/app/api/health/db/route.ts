import { NextResponse } from "next/server";
import { getRegisteredAccountIds } from "@/lib/account-registry";
import { ensureDatabase, getDb } from "@/lib/db";
import { getErrorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const accountCount = getRegisteredAccountIds().length;
    await ensureDatabase();
    const row = getDb()
      .prepare("SELECT COUNT(*) AS count FROM fetch_runs")
      .get() as { count: number };
    return NextResponse.json({
      ok: true,
      accountCount,
      fetchRunCount: row.count,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
