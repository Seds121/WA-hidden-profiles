import "server-only";

import {
  deleteRegisteredAccount,
  getMaxAccounts,
  registerNewAccount,
} from "@/lib/account-pool";
import { delay } from "@/lib/lookup-profile";
import { clearProfileCache } from "@/lib/profile-cache";
import {
  ensureAllAccountsStarted,
  ensureClientStarted,
  getAllAccountsStatus,
  getStatus,
  resetClient,
} from "@/lib/whatsapp-client";

export type WhatsAppConnectionState =
  | "connected"
  | "scan_qr"
  | "connecting"
  | "not_connected";

export type PublicWhatsAppAccount = {
  accountId: string;
  ready: boolean;
  authenticated: boolean;
  connectedPhone: string | null;
  loadingPercent: number | null;
  qrCode: string | null;
  qrCodeDataUrl: string | null;
  initialized: boolean;
  lastError: string | null;
  requiresQrScan: boolean;
  startupPhase: "idle" | "starting" | "waiting-qr" | "ready" | "error";
  status: WhatsAppConnectionState;
  message: string;
};

type InternalAccountStatus = Awaited<ReturnType<typeof getStatus>>;

export function connectionStateFromAccount(
  account: InternalAccountStatus,
): WhatsAppConnectionState {
  if (account.ready) {
    return "connected";
  }
  if (account.qrCodeDataUrl || account.qrCode) {
    return "scan_qr";
  }
  if (
    account.initialized ||
    account.loadingPercent !== null ||
    account.authenticated
  ) {
    return "connecting";
  }
  return "not_connected";
}

export function statusMessageFromAccount(
  account: InternalAccountStatus,
): string {
  if (account.ready) {
    const phone = account.connectedPhone
      ? ` (+${account.connectedPhone.replace(/^\+/, "")})`
      : "";
    return `WhatsApp account ${account.accountId} is connected${phone}`;
  }
  if (account.qrCode || account.qrCodeDataUrl) {
    return `No WhatsApp is added for account ${account.accountId}. Scan the QR code.`;
  }
  if (account.lastError) {
    return account.lastError;
  }
  if (account.authenticated) {
    return `Account ${account.accountId} authenticated, finishing setup...`;
  }
  if (typeof account.loadingPercent === "number" && account.loadingPercent >= 0) {
    return `Loading account ${account.accountId}... ${account.loadingPercent}%`;
  }
  if (account.initialized) {
    return `Starting account ${account.accountId} — QR may take 1-2 min`;
  }
  return `Starting WhatsApp account ${account.accountId}...`;
}

export function toPublicAccount(
  account: InternalAccountStatus,
): PublicWhatsAppAccount {
  return {
    accountId: account.accountId,
    ready: account.ready,
    authenticated: account.authenticated,
    connectedPhone: account.connectedPhone,
    loadingPercent: account.loadingPercent,
    qrCode: account.qrCode,
    qrCodeDataUrl: account.qrCodeDataUrl,
    initialized: account.initialized,
    lastError: account.lastError,
    requiresQrScan: account.requiresQrScan,
    startupPhase: account.startupPhase,
    status: connectionStateFromAccount(account),
    message: statusMessageFromAccount(account),
  };
}

export function poolSummaryMessage(
  anyReady: boolean,
  readyCount: number,
  accounts: PublicWhatsAppAccount[],
): string {
  if (anyReady) {
    return `${readyCount} WhatsApp account(s) ready`;
  }
  const scanning = accounts.find((account) => account.status === "scan_qr");
  if (scanning) {
    return "No WhatsApp is added. Scan the QR code to connect.";
  }
  const connecting = accounts.find((account) => account.status === "connecting");
  if (connecting) {
    return connecting.message;
  }
  return "No WhatsApp is added. Start an account and scan its QR code.";
}

export async function loadWhatsAppPool() {
  ensureAllAccountsStarted();
  const pool = await getAllAccountsStatus();
  const accounts = pool.accounts.map(toPublicAccount);
  return {
    accounts,
    readyCount: pool.readyCount,
    anyReady: pool.anyReady,
    accountCount: pool.accounts.length,
    maxAccounts: getMaxAccounts(),
    message: poolSummaryMessage(pool.anyReady, pool.readyCount, accounts),
  };
}

export function findPublicAccount(
  accounts: PublicWhatsAppAccount[],
  accountId: string,
): PublicWhatsAppAccount | undefined {
  return accounts.find((account) => account.accountId === accountId);
}

export async function addWhatsAppAccount() {
  const accountId = registerNewAccount();
  ensureClientStarted(accountId);
  await delay(200);
  const pool = await loadWhatsAppPool();
  const account =
    findPublicAccount(pool.accounts, accountId) ??
    toPublicAccount(await getStatus(accountId));
  return {
    accountId,
    account,
    pool,
    message: `Account ${accountId} added. Scan the QR code to connect.`,
  };
}

export async function disconnectWhatsAppAccount(accountId: string) {
  await resetClient({ clearSession: true, accountId });
  clearProfileCache();
  await delay(300);
  ensureClientStarted(accountId);
  const pool = await loadWhatsAppPool();
  const account =
    findPublicAccount(pool.accounts, accountId) ??
    toPublicAccount(await getStatus(accountId));
  return {
    accountId,
    account,
    pool,
    message: `Account ${accountId} disconnected. Scan the new QR code.`,
  };
}

export async function deleteWhatsAppAccount(accountId: string) {
  await resetClient({ clearSession: true, accountId });
  deleteRegisteredAccount(accountId);
  clearProfileCache();
  await delay(300);
  const pool = await loadWhatsAppPool();
  return {
    accountId,
    pool,
    message: `Account ${accountId} deleted and logged out`,
  };
}
