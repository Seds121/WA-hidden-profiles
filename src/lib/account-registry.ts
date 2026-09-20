import "server-only";

import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/data-path";

const MAX_ACCOUNTS = Number.parseInt(
  process.env.WWJS_MAX_ACCOUNTS || "20",
  10,
);

type StoredAccount = {
  id: string;
  createdAt: number;
};

function accountsFilePath(): string {
  return path.join(getDataDir(), "wa_accounts.json");
}

function readAccountsFile(): StoredAccount[] {
  const filePath = accountsFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is StoredAccount =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as StoredAccount).id === "string" &&
        typeof (item as StoredAccount).createdAt === "number",
    );
  } catch {
    return [];
  }
}

function writeAccountsFile(accounts: StoredAccount[]): void {
  const filePath = accountsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2), "utf8");
}

export function getRegisteredAccountIds(): string[] {
  const accounts = readAccountsFile();
  return accounts
    .map((account) => account.id)
    .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
}

export function addRegisteredAccount(): string {
  const accounts = readAccountsFile();
  if (accounts.length >= MAX_ACCOUNTS) {
    throw new Error(`Maximum of ${MAX_ACCOUNTS} WhatsApp accounts allowed`);
  }

  const nextId =
    accounts.length === 0
      ? "1"
      : String(
          Math.max(...accounts.map((account) => Number.parseInt(account.id, 10))) +
            1,
        );

  accounts.push({ id: nextId, createdAt: Date.now() });
  writeAccountsFile(accounts);
  return nextId;
}

export function ensureDefaultAccount(): void {
  const accounts = readAccountsFile();
  if (accounts.length === 0) {
    writeAccountsFile([{ id: "1", createdAt: Date.now() }]);
  }
}

export function removeRegisteredAccount(accountId: string): void {
  const accounts = readAccountsFile();
  if (accounts.length <= 1) {
    throw new Error("Cannot delete the last WhatsApp account slot");
  }

  const next = accounts.filter((account) => account.id !== accountId);
  if (next.length === accounts.length) {
    throw new Error(`Account ${accountId} is not registered`);
  }

  writeAccountsFile(next);
}
