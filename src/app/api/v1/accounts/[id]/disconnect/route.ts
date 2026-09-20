import { NextRequest } from "next/server";
import { disconnectWhatsAppAccount } from "@/lib/api-accounts";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import { getAccountIds } from "@/lib/account-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  const accountId = (await context.params).id.trim();
  if (!accountId) {
    return jsonWithCors(request, { error: "accountId is required" }, { status: 400 });
  }

  try {
    if (!getAccountIds().includes(accountId)) {
      return jsonWithCors(
        request,
        { error: `Account ${accountId} is not registered` },
        { status: 404 },
      );
    }

    const result = await disconnectWhatsAppAccount(accountId);
    return jsonWithCors(request, {
      success: true,
      accountId,
      account: result.account,
      qrCode: result.account.qrCode,
      qrCodeDataUrl: result.account.qrCodeDataUrl,
      requiresQrScan: result.account.requiresQrScan,
      ready: result.account.ready,
      whatsappAdded: result.pool.anyReady,
      readyCount: result.pool.readyCount,
      accountCount: result.pool.accountCount,
      maxAccounts: result.pool.maxAccounts,
      accounts: result.pool.accounts,
      message: result.message,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to disconnect WhatsApp account";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
