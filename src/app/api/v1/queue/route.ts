import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import {
  enqueuePhones,
  getQueueCounts,
  QUEUE_INGEST_MAX,
} from "@/lib/queue-store";
import { getQueueWorkerStatus, startQueueWorker } from "@/lib/queue-worker";

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

  startQueueWorker();

  try {
    const counts = await getQueueCounts();
    const worker = getQueueWorkerStatus();
    return jsonWithCors(request, {
      success: true,
      ...counts,
      worker,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to read queue";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  startQueueWorker();

  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return jsonWithCors(request, { error: "Invalid JSON body" }, { status: 400 });
    }

    const phonesRaw = (body as { phones?: unknown }).phones;
    if (!Array.isArray(phonesRaw) || phonesRaw.length === 0) {
      return jsonWithCors(
        request,
        { error: "phones must be a non-empty array of strings" },
        { status: 400 },
      );
    }

    if (phonesRaw.length > QUEUE_INGEST_MAX) {
      return jsonWithCors(
        request,
        {
          error: `Send at most ${QUEUE_INGEST_MAX} numbers per request. Upload a million numbers in chunks.`,
        },
        { status: 400 },
      );
    }

    const phones = phonesRaw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const result = await enqueuePhones(phones);
    return jsonWithCors(request, {
      success: true,
      ...result,
      totalReceived: phones.length,
      message:
        "Numbers stored in SQLite. The background worker fetches 50 per linked WhatsApp, then rests 20 minutes.",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to enqueue numbers";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
