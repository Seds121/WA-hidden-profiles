import { NextRequest } from "next/server";
import { addWhatsAppAccount, loadWhatsAppPool } from "@/lib/api-accounts";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import { startQueueWorker } from "@/lib/queue-worker";

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
    return jsonWithCors(request, {
      success: true,
      ready: pool.anyReady,
      whatsappAdded: pool.anyReady,
      readyCount: pool.readyCount,
      accountCount: pool.accountCount,
      maxAccounts: pool.maxAccounts,
      accounts: pool.accounts,
      message: pool.message,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list WhatsApp accounts";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await addWhatsAppAccount();
    return jsonWithCors(
      request,
      {
        success: true,
        accountId: result.accountId,
        account: result.account,
        qrCode: result.account.qrCode,
        qrCodeDataUrl: result.account.qrCodeDataUrl,
        requiresQrScan: result.account.requiresQrScan,
        ready: result.pool.anyReady,
        whatsappAdded: result.pool.anyReady,
        readyCount: result.pool.readyCount,
        accountCount: result.pool.accountCount,
        maxAccounts: result.pool.maxAccounts,
        accounts: result.pool.accounts,
        message: result.message,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to add WhatsApp account";
    const status = message.toLowerCase().includes("maximum") ? 400 : 500;
    return jsonWithCors(request, { error: message }, { status });
  }
}
