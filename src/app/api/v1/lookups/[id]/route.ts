import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import { getApiJob } from "@/lib/api-jobs";
import { absolutizeProfile, getPublicBaseUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const job = await getApiJob(id);
    if (!job) {
      return jsonWithCors(request, { error: "Job not found" }, { status: 404 });
    }

    const baseUrl = getPublicBaseUrl(request);
    return jsonWithCors(request, {
      success: true,
      jobId: job.jobId,
      status: job.status,
      total: job.total,
      completed: job.completed,
      successCount: job.successCount,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      results: job.results.map((result) => absolutizeProfile(result, baseUrl)),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load job";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
