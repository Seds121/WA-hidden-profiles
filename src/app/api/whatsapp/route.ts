import { NextRequest, NextResponse } from "next/server";
import {
  getApiChunkSize,
  getBatchChunkSize,
  getBatchDelayMs,
  getLogProgressInterval,
  pickAccountForIndex,
  registerNewAccount,
  deleteRegisteredAccount,
} from "@/lib/account-pool";
import { getErrorMessage } from "@/lib/errors";
import {
  delay,
  INVALID_PHONE_MESSAGE,
  lookupProfile,
  persistRunResults,
  pickReadyAccount,
} from "@/lib/lookup-profile";
import { toInternationalDigits } from "@/lib/phone";
import { clearProfileCache } from "@/lib/profile-cache";
import type { ProfileLookupResult } from "@/lib/profile-types";
import {
  ensureClientStarted,
  ensureAllAccountsStarted,
  getAllAccountsStatus,
  getReadyAccountIds,
  getStatus,
  isClientReady,
  diagnoseProfileLookup,
  resetClient,
} from "@/lib/whatsapp-client";

export type { ProfileLookupResult } from "@/lib/profile-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function notReadyResponse() {
  return NextResponse.json(
    {
      error:
        "No WhatsApp account is ready. Connect at least one account and scan its QR code.",
    },
    { status: 503 },
  );
}

function statusMessageFromAccount(
  status: Awaited<ReturnType<typeof getStatus>>,
): string {
  if (status.ready) {
    return `WhatsApp account ${status.accountId} is ready`;
  }
  if (status.qrCode || status.qrCodeDataUrl) {
    return `Scan QR code for account ${status.accountId}`;
  }
  if (status.lastError) {
    return status.lastError;
  }
  if (status.authenticated) {
    return `Account ${status.accountId} authenticated, finishing setup...`;
  }
  if (typeof status.loadingPercent === "number" && status.loadingPercent >= 0) {
    return `Loading account ${status.accountId}... ${status.loadingPercent}%`;
  }
  if (status.initialized) {
    return `Starting account ${status.accountId} — QR may take 1-2 min on VPS`;
  }
  return "Starting WhatsApp client...";
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get("phone");
    const checkStatus = searchParams.get("checkStatus") === "true";
    const forceRefresh = searchParams.get("refresh") === "true";
    const debug = searchParams.get("debug") === "true";

    if (checkStatus) {
      ensureAllAccountsStarted();
      const { startQueueWorker } = await import("@/lib/queue-worker");
      startQueueWorker();
      const statusAccountId = searchParams.get("accountId") || "1";
      const pool = await getAllAccountsStatus();
      const primary =
        pool.accounts.find((account) => account.accountId === statusAccountId) ||
        pool.accounts[0];

      return NextResponse.json({
        ready: pool.anyReady,
        readyCount: pool.readyCount,
        accounts: pool.accounts,
        accountId: primary?.accountId ?? "1",
        authenticated: primary?.authenticated ?? false,
        loadingPercent: primary?.loadingPercent ?? null,
        qrCode: primary?.qrCode ?? null,
        qrCodeDataUrl: primary?.qrCodeDataUrl ?? null,
        initialized: primary?.initialized ?? false,
        lastError: primary?.lastError ?? null,
        requiresQrScan: primary?.requiresQrScan ?? false,
        batchChunkSize: getBatchChunkSize(),
        apiChunkSize: getApiChunkSize(),
        logProgressInterval: getLogProgressInterval(),
        message: pool.anyReady
          ? `${pool.readyCount} WhatsApp account(s) ready`
          : primary
            ? statusMessageFromAccount(primary)
            : "Initializing...",
      });
    }

    if (!phone) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 },
      );
    }

    if (!toInternationalDigits(phone)) {
      return NextResponse.json(
        { error: INVALID_PHONE_MESSAGE },
        { status: 400 },
      );
    }

    const requestedAccountId = searchParams.get("accountId");
    const accountId = pickReadyAccount(requestedAccountId);
    if (!accountId) {
      return notReadyResponse();
    }

    if (debug) {
      const digits = toInternationalDigits(phone);
      if (!digits) {
        return NextResponse.json(
          { error: INVALID_PHONE_MESSAGE },
          { status: 400 },
        );
      }
      const diagnostic = await diagnoseProfileLookup(digits, accountId);
      return NextResponse.json(diagnostic);
    }

    const result = await lookupProfile(phone, forceRefresh, accountId);
    const runId = searchParams.get("runId");
    try {
      await persistRunResults(runId, [result]);
    } catch (persistError: unknown) {
      console.warn(
        "Profile lookup succeeded but saving it failed:",
        getErrorMessage(persistError),
      );
    }
    return NextResponse.json({ ...result, runId: runId ?? undefined });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const status = message.includes("not ready") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as {
      action?: unknown;
      phones?: unknown;
      startIndex?: unknown;
      accountId?: unknown;
      runId?: unknown;
      clearSession?: boolean;
    };

    const { action, phones } = payload;

    if (action === "addAccount") {
      const accountId = registerNewAccount();
      ensureClientStarted(accountId);
      await delay(200);
      const pool = await getAllAccountsStatus();
      const status = await getStatus(accountId);
      return NextResponse.json({
        success: true,
        accountId,
        accounts: pool.accounts,
        readyCount: pool.readyCount,
        message: `Account ${accountId} added. Scan the QR code to connect.`,
        qrCodeDataUrl: status.qrCodeDataUrl,
      });
    }

    if (action === "deleteAccount") {
      const accountId =
        typeof payload.accountId === "string" && payload.accountId.trim()
          ? payload.accountId.trim()
          : "";

      if (!accountId) {
        return NextResponse.json(
          { error: "accountId is required" },
          { status: 400 },
        );
      }

      await resetClient({ clearSession: true, accountId });
      deleteRegisteredAccount(accountId);
      clearProfileCache();
      await delay(300);

      const pool = await getAllAccountsStatus();
      return NextResponse.json({
        success: true,
        accountId,
        accounts: pool.accounts,
        readyCount: pool.readyCount,
        message: `Account ${accountId} deleted and logged out`,
      });
    }

    if (action === "reset" || action === "disconnect") {
      const clearSession =
        action === "disconnect" ||
        action === "reset" ||
        payload.clearSession === true;
      const accountId =
        typeof payload.accountId === "string" && payload.accountId.trim()
          ? payload.accountId.trim()
          : "1";

      await resetClient({ clearSession, accountId });
      clearProfileCache();
      await delay(300);
      ensureClientStarted(accountId);
      const status = await getStatus(accountId);
      return NextResponse.json({
        success: true,
        accountId,
        ready: status.ready,
        qrCodeDataUrl: status.qrCodeDataUrl,
        requiresQrScan: status.requiresQrScan,
        message: clearSession
          ? `Account ${accountId} disconnected. Scan the new QR code.`
          : `Account ${accountId} reset successfully`,
      });
    }

    if (action === "fetchMultiple") {
      if (!isStringArray(phones) || phones.length === 0) {
        return NextResponse.json(
          { error: "phones must be a non-empty array of strings" },
          { status: 400 },
        );
      }

      if (phones.length > getApiChunkSize()) {
        return NextResponse.json(
          {
            error: `Send at most ${getApiChunkSize()} numbers per request. Process large CSVs in chunks from the browser.`,
          },
          { status: 400 },
        );
      }

      ensureAllAccountsStarted();
      const readyAccounts = getReadyAccountIds();
      if (readyAccounts.length === 0) {
        return notReadyResponse();
      }

      const startIndex =
        typeof payload.startIndex === "number" && payload.startIndex >= 0
          ? payload.startIndex
          : 0;

      const runId =
        typeof payload.runId === "string" && payload.runId.trim()
          ? payload.runId.trim()
          : null;

      const results: ProfileLookupResult[] = [];
      const { appendFetchRunLog } = await import("@/lib/fetch-run-store");

      for (let i = 0; i < phones.length; i += 1) {
        const rawPhone = phones[i];
        const seq = startIndex + i + 1;
        const preferredAccountId =
          pickAccountForIndex(startIndex + i, readyAccounts) || readyAccounts[0];
        const accountId =
          isClientReady(preferredAccountId)
            ? preferredAccountId
            : readyAccounts.find((id) => isClientReady(id)) || readyAccounts[0];

        if (!isClientReady(accountId)) {
          const failed = {
            phone: rawPhone,
            success: false,
            error: `WhatsApp account ${accountId} is not ready`,
            accountId,
          };
          results.push(failed);
          if (runId) {
            await appendFetchRunLog(runId, seq, failed, accountId);
          }
          continue;
        }

        const result = await lookupProfile(rawPhone, false, accountId);
        results.push(result);
        if (runId) {
          await appendFetchRunLog(runId, seq, result, accountId);
        }
        if (!result.fromCache && !result.reusedFromDb) {
          await delay(getBatchDelayMs());
        }
      }

      await persistRunResults(runId, results);

      return NextResponse.json({
        success: true,
        results,
        startIndex,
        chunkSize: getBatchChunkSize(),
        readyAccounts,
        runId,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: addAccount, deleteAccount, reset, disconnect, fetchMultiple" },
      { status: 400 },
    );
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const status = message.includes("not ready") ? 503 : 500;
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status },
    );
  }
}
