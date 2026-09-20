import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import { API_JOB_MAX_PHONES, createApiJob } from "@/lib/api-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const phonesRaw = (body as { phones?: unknown }).phones;
    if (!Array.isArray(phonesRaw) || phonesRaw.length === 0) {
      return jsonWithCors(
        request,
        { error: "phones must be a non-empty array of strings" },
        { status: 400 },
      );
    }

    const phones = phonesRaw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (phones.length === 0) {
      return jsonWithCors(
        request,
        { error: "phones must contain at least one number" },
        { status: 400 },
      );
    }

    if (phones.length > API_JOB_MAX_PHONES) {
      return jsonWithCors(
        request,
        {
          error: `Send at most ${API_JOB_MAX_PHONES} numbers per job`,
        },
        { status: 400 },
      );
    }

    const job = await createApiJob(phones, auth.key.id);
    return jsonWithCors(
      request,
      {
        success: true,
        jobId: job.jobId,
        status: job.status,
        total: job.total,
        pollUrl: `/api/v1/lookups/${job.jobId}`,
        message: "Job queued. Poll GET /api/v1/lookups/{jobId} until status is completed or failed.",
      },
      { status: 202 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create lookup job";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
