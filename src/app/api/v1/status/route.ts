import { NextRequest } from "next/server";
import { loadWhatsAppPool } from "@/lib/api-accounts";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
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

  try {
    startQueueWorker();
    const pool = await loadWhatsAppPool();
    const worker = getQueueWorkerStatus();
    return jsonWithCors(request, {
      success: true,
      ready: pool.anyReady,
      whatsappAdded: pool.anyReady,
      readyCount: pool.readyCount,
      accountCount: pool.accountCount,
      maxAccounts: pool.maxAccounts,
      accounts: pool.accounts,
      worker,
      message: pool.message,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to read status";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
