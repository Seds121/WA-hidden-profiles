import { NextRequest, NextResponse } from "next/server";
import {
  enqueuePhones,
  getQueueCounts,
  QUEUE_INGEST_MAX,
} from "@/lib/queue-store";
import { getQueueWorkerStatus, startQueueWorker } from "@/lib/queue-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  startQueueWorker();
  try {
    const counts = await getQueueCounts();
    return NextResponse.json({
      success: true,
      ...counts,
      worker: getQueueWorkerStatus(),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to read queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  startQueueWorker();
  try {
    const body: unknown = await request.json();
    const phonesRaw = (body as { phones?: unknown }).phones;
    if (!Array.isArray(phonesRaw) || phonesRaw.length === 0) {
      return NextResponse.json(
        { error: "phones must be a non-empty array of strings" },
        { status: 400 },
      );
    }
    if (phonesRaw.length > QUEUE_INGEST_MAX) {
      return NextResponse.json(
        {
          error: `Send at most ${QUEUE_INGEST_MAX} numbers per request`,
        },
        { status: 400 },
      );
    }
    const phones = phonesRaw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const result = await enqueuePhones(phones);
    return NextResponse.json({ success: true, ...result, totalReceived: phones.length });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to enqueue numbers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
