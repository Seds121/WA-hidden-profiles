import { NextRequest } from "next/server";
import {
  deleteWhatsAppAccount,
  findPublicAccount,
  loadWhatsAppPool,
} from "@/lib/api-accounts";
import { requireApiKey } from "@/lib/api-auth";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import { getAccountIds } from "@/lib/account-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function accountIdFromParams(params: { id: string }): string {
  return params.id.trim();
}

function notFound(request: NextRequest, accountId: string) {
  return jsonWithCors(
    request,
    { error: `Account ${accountId} is not registered` },
    { status: 404 },
  );
}

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  const accountId = accountIdFromParams(await context.params);
  if (!accountId) {
    return jsonWithCors(request, { error: "accountId is required" }, { status: 400 });
  }

  try {
    if (!getAccountIds().includes(accountId)) {
      return notFound(request, accountId);
    }

    const pool = await loadWhatsAppPool();
    const account = findPublicAccount(pool.accounts, accountId);
    if (!account) {
      return notFound(request, accountId);
    }

    return jsonWithCors(request, {
      success: true,
      accountId,
      account,
      qrCode: account.qrCode,
      qrCodeDataUrl: account.qrCodeDataUrl,
      requiresQrScan: account.requiresQrScan,
      ready: account.ready,
      whatsappAdded: account.ready,
      message: account.message,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to read WhatsApp account";
    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  const accountId = accountIdFromParams(await context.params);
  if (!accountId) {
    return jsonWithCors(request, { error: "accountId is required" }, { status: 400 });
  }

  try {
    if (!getAccountIds().includes(accountId)) {
      return notFound(request, accountId);
    }

    const result = await deleteWhatsAppAccount(accountId);
    return jsonWithCors(request, {
      success: true,
      accountId,
      ready: result.pool.anyReady,
      whatsappAdded: result.pool.anyReady,
      readyCount: result.pool.readyCount,
      accountCount: result.pool.accountCount,
      maxAccounts: result.pool.maxAccounts,
      accounts: result.pool.accounts,
      message: result.message,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete WhatsApp account";
    const status =
      message.toLowerCase().includes("last") ||
      message.toLowerCase().includes("not registered")
        ? 400
        : 500;
    return jsonWithCors(request, { error: message }, { status });
  }
}
