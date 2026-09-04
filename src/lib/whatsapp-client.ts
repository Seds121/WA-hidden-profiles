import "server-only";

import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";
import { getErrorMessage } from "@/lib/errors";
import { sanitizePersonName } from "@/lib/profile-names";

type WhatsAppRuntimeState = {
  client: Client | null;
  isReady: boolean;
  authenticated: boolean;
  loadingPercent: number | null;
  qrCode: string | null;
  qrCodeDataUrl: string | null;
  startPromise: Promise<void> | null;
  lastError: string | null;
  lastAttemptAt: number | null;
  readyFallbackTimer: ReturnType<typeof setTimeout> | null;
};

const RETRY_COOLDOWN_MS = 15_000;
const READY_FALLBACK_MS = 4_000;

const globalForWhatsApp = globalThis as typeof globalThis & {
  __whatsappProfileFetcher?: WhatsAppRuntimeState;
};

function getRuntimeState(): WhatsAppRuntimeState {
  if (!globalForWhatsApp.__whatsappProfileFetcher) {
    globalForWhatsApp.__whatsappProfileFetcher = {
      client: null,
      isReady: false,
      authenticated: false,
      loadingPercent: null,
      qrCode: null,
      qrCodeDataUrl: null,
      startPromise: null,
      lastError: null,
      lastAttemptAt: null,
      readyFallbackTimer: null,
    };
  }

  const state = globalForWhatsApp.__whatsappProfileFetcher;
  if (typeof state.authenticated !== "boolean") {
    state.authenticated = false;
  }
  if (state.loadingPercent === undefined) {
    state.loadingPercent = null;
  }
  if (state.readyFallbackTimer === undefined) {
    state.readyFallbackTimer = null;
  }
  return state;
}

function resolveSessionDir(): string {
  const raw = process.env.WWJS_SESSION_DIR || ".wwebjs_auth";
  const cwd = process.cwd();
  const resolved = path.resolve(cwd, raw);
  const relative = path.relative(cwd, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("WWJS_SESSION_DIR must stay inside the project directory");
  }

  return resolved;
}

function ensureSessionDirectory(): string {
  const sessionDir = resolveSessionDir();
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

function clearReadyFallbackTimer(): void {
  const state = getRuntimeState();
  if (state.readyFallbackTimer) {
    clearTimeout(state.readyFallbackTimer);
    state.readyFallbackTimer = null;
  }
}

function resetRuntimeState(preserveError = false): void {
  const state = getRuntimeState();
  const lastError = preserveError ? state.lastError : null;
  const lastAttemptAt = preserveError ? state.lastAttemptAt : null;
  clearReadyFallbackTimer();
  state.client = null;
  state.isReady = false;
  state.authenticated = false;
  state.loadingPercent = null;
  state.qrCode = null;
  state.qrCodeDataUrl = null;
  state.startPromise = null;
  state.lastError = lastError;
  state.lastAttemptAt = lastAttemptAt;
}

function isCurrentClient(client: Client): boolean {
  return getRuntimeState().client === client;
}

function markReady(client: Client, source: string): void {
  if (!isCurrentClient(client)) {
    return;
  }
  const state = getRuntimeState();
  clearReadyFallbackTimer();
  state.isReady = true;
  state.authenticated = true;
  state.qrCode = null;
  state.qrCodeDataUrl = null;
  state.lastError = null;
  state.loadingPercent = null;
  console.log(`WhatsApp client is ready (${source}).`);
}

function resolveChromeExecutable(): string | undefined {
  const fromEnv =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (fromEnv) {
    return fromEnv;
  }

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function launchClient(): Promise<void> {
  const state = getRuntimeState();
  const sessionDir = ensureSessionDirectory();
  const executablePath = resolveChromeExecutable();

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: sessionDir,
    }),
    puppeteer: {
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    },
  });

  state.client = client;

  client.on("qr", (qr: string) => {
    if (!isCurrentClient(client)) {
      return;
    }
    const current = getRuntimeState();
    current.qrCode = qr;
    current.lastError = null;
    console.log("QR Code received. Scan with WhatsApp:");
    qrcodeTerminal.generate(qr, { small: true });

    void QRCode.toDataURL(qr, { width: 220, margin: 1 })
      .then((dataUrl) => {
        if (isCurrentClient(client)) {
          getRuntimeState().qrCodeDataUrl = dataUrl;
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to render QR image:", error);
        if (isCurrentClient(client)) {
          getRuntimeState().qrCodeDataUrl = null;
        }
      });
  });

  client.on("loading_screen", (percent: number) => {
    if (!isCurrentClient(client)) {
      return;
    }
    getRuntimeState().loadingPercent = percent;
  });

  client.on("authenticated", () => {
    if (!isCurrentClient(client)) {
      return;
    }
    const current = getRuntimeState();
    current.authenticated = true;
    current.qrCode = null;
    current.qrCodeDataUrl = null;
    current.lastError = null;
    console.log("WhatsApp client authenticated!");

    // Current whatsapp-web.js can emit authenticated and then throw before
    // 'ready' (LID / ClientInfo). Unlock the UI if ready never arrives.
    clearReadyFallbackTimer();
    current.readyFallbackTimer = setTimeout(() => {
      markReady(client, "authenticated-fallback");
    }, READY_FALLBACK_MS);
  });

  client.on("ready", () => {
    markReady(client, "ready-event");
  });

  client.on("auth_failure", (msg: string) => {
    if (!isCurrentClient(client)) {
      return;
    }
    console.error("Authentication failed:", msg);
    getRuntimeState().lastError = `Authentication failed: ${msg}`;
    void client.destroy().catch(() => undefined);
    resetRuntimeState(true);
  });

  client.on("disconnected", (reason: string) => {
    if (!isCurrentClient(client)) {
      return;
    }
    console.log("Client disconnected:", reason);
    getRuntimeState().lastError = `Client disconnected: ${String(reason)}`;
    resetRuntimeState(true);
  });

  await client.initialize();
}

/**
 * Starts Puppeteer / WhatsApp Web in the background.
 * Does not wait for the user to scan the QR code.
 */
export function ensureClientStarted(): void {
  const state = getRuntimeState();
  if (state.client || state.startPromise) {
    return;
  }

  const now = Date.now();
  if (
    state.lastError &&
    state.lastAttemptAt &&
    now - state.lastAttemptAt < RETRY_COOLDOWN_MS
  ) {
    return;
  }

  state.lastAttemptAt = now;
  state.startPromise = launchClient()
    .then(() => {
      const current = getRuntimeState();
      if (current.isReady || current.qrCode || current.authenticated) {
        current.lastError = null;
      }
    })
    .catch((error: unknown) => {
      const message = getErrorMessage(error);
      console.error("WhatsApp client failed to start:", error);
      const current = getRuntimeState();
      const existing = current.client;
      current.lastError = message;
      current.lastAttemptAt = Date.now();
      resetRuntimeState(true);
      if (existing) {
        existing.removeAllListeners();
        void existing.destroy().catch(() => undefined);
      }
    });
}

/**
 * Returns the client once it is authenticated and ready.
 * Throws if the session is not ready yet — callers should check status first.
 */
export async function getWhatsAppClient(): Promise<Client> {
  ensureClientStarted();
  const state = getRuntimeState();

  if (state.client && state.isReady) {
    return state.client;
  }

  throw new Error("WhatsApp client not ready yet. Please scan QR code.");
}

export function getQRCode(): string | null {
  return getRuntimeState().qrCode;
}

export function isClientReady(): boolean {
  return getRuntimeState().isReady;
}

export async function resetClient(): Promise<void> {
  const state = getRuntimeState();
  const existing = state.client;
  if (existing) {
    existing.removeAllListeners();
  }
  resetRuntimeState(false);

  if (existing) {
    try {
      await existing.destroy();
    } catch (error: unknown) {
      console.error("Error destroying WhatsApp client:", error);
    }
  }
}

export async function getStatus() {
  const state = getRuntimeState();

  if (state.client && !state.isReady) {
    try {
      const waState = await state.client.getState();
      if (waState === "CONNECTED") {
        markReady(state.client, "connected-state");
      }
    } catch {
      // Session already restored (no QR) but the library never emitted 'ready'.
      if (state.client.pupPage && !state.qrCode) {
        markReady(state.client, "session-page");
      }
    }
  }

  const current = getRuntimeState();
  return {
    ready: current.isReady,
    authenticated: current.authenticated,
    loadingPercent: current.loadingPercent,
    qrCode: current.qrCode,
    qrCodeDataUrl: current.qrCodeDataUrl,
    initialized: current.client !== null || current.startPromise !== null,
    lastError: current.lastError,
  };
}

export type ProfilePicLookup = {
  url: string | null;
  resolvedId: string | null;
  error: string | null;
};

export type BusinessProfileInfo = {
  tag?: string | null;
  description?: string | null;
  categories?: string[];
  email?: string | null;
  website?: string[];
  address?: string | null;
};

export type ProfileDetails = ProfilePicLookup & {
  existsOnWhatsApp?: boolean;
  name?: string | null;
  pushname?: string | null;
  shortName?: string | null;
  verifiedName?: string | null;
  displayName?: string | null;
  about?: string | null;
  isBusiness?: boolean;
  isEnterprise?: boolean;
  isWAContact?: boolean;
  isMyContact?: boolean;
  accountType?: string;
  businessProfile?: BusinessProfileInfo | null;
};

type ContactLike = {
  name?: string | null;
  pushname?: string | null;
  shortName?: string | null;
  verifiedName?: string | null;
  about?: string | null;
  isBusiness?: boolean;
  isEnterprise?: boolean;
  isWAContact?: boolean;
  isMyContact?: boolean;
  businessProfile?: BusinessProfileInfo | null;
};

type PageContactMetadata = ContactLike;

function pickDisplayName(
  contact: ContactLike,
  businessProfile?: BusinessProfileInfo | null,
): string | null {
  const tag =
    businessProfile?.tag && !/^\d{5,}$/.test(businessProfile.tag.trim())
      ? businessProfile.tag
      : null;

  const candidates = [
    contact.verifiedName,
    contact.pushname,
    contact.name,
    contact.shortName,
    tag,
  ];
  for (const value of candidates) {
    const sanitized = sanitizePersonName(value);
    if (sanitized) {
      return sanitized;
    }
  }
  return null;
}

function resolveAccountType(
  contact: ContactLike,
  businessProfile?: BusinessProfileInfo | null,
): string {
  if (contact.isEnterprise) {
    return "Enterprise";
  }
  if (
    contact.isBusiness ||
    businessProfile?.tag ||
    businessProfile?.description ||
    (businessProfile?.categories && businessProfile.categories.length > 0)
  ) {
    return "Business";
  }
  return "Personal";
}

function extractBusinessProfile(
  profile?: BusinessProfileInfo | null,
): BusinessProfileInfo | null {
  if (!profile) {
    return null;
  }

  return {
    tag: profile.tag || null,
    description: profile.description || null,
    categories: profile.categories || [],
    email: profile.email || null,
    website: profile.website || [],
    address: profile.address || null,
  };
}

function mergeText(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}


async function lookupContactMetadata(
  phoneDigits: string,
  resolvedId: string | null,
): Promise<PageContactMetadata | null> {
  const client = await getWhatsAppClient();
  const page = client.pupPage;
  if (!page) {
    return null;
  }

  return page.evaluate(
    async ({
      digits,
      resolved,
    }: {
      digits: string;
      resolved: string | null;
    }) => {
      const win = window as unknown as {
        require: (name: string) => Record<string, unknown>;
        WWebJS?: {
          getContact?: (contactId: string) => Promise<Record<string, unknown>>;
        };
      };

      const text = (value: unknown): string | null => {
        if (typeof value !== "string") {
          return null;
        }
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      };

      const ids = Array.from(
        new Set(
          [`${digits}@c.us`, `${digits}@s.whatsapp.net`, resolved].filter(
            Boolean,
          ),
        ),
      ) as string[];

      type BizShape = {
        description?: string;
        tag?: string;
        categories?: Array<{ localized_display_name?: string }>;
        email?: string;
        website?: string[];
        address?: string;
      };

      type Merged = {
        name: string | null;
        pushname: string | null;
        shortName: string | null;
        verifiedName: string | null;
        about: string | null;
        isBusiness: boolean;
        isEnterprise: boolean;
        isWAContact?: boolean;
        isMyContact: boolean;
        businessProfile: {
          tag: string | null;
          description: string | null;
          categories: string[];
          email: string | null;
          website: string[];
          address: string | null;
        } | null;
      };

      const mergeBiz = (
        current: Merged["businessProfile"],
        source:
          | BizShape
          | Merged["businessProfile"]
          | null
          | undefined,
      ): Merged["businessProfile"] => {
        if (!source) {
          return current;
        }
        const categories =
          "categories" in source && Array.isArray(source.categories)
            ? source.categories
                .map((item) =>
                  typeof item === "string"
                    ? item
                    : item.localized_display_name,
                )
                .filter((value): value is string => Boolean(value))
            : [];

        return {
          tag: text(source.tag) || current?.tag || null,
          description: text(source.description) || current?.description || null,
          categories:
            categories.length > 0 ? categories : current?.categories || [],
          email: text(source.email) || current?.email || null,
          website:
            source.website && source.website.length > 0
              ? source.website
              : current?.website || [],
          address: text(source.address) || current?.address || null,
        };
      };

      const merge = (current: Merged | null, next: Partial<Merged>): Merged => {
        const businessProfile = mergeBiz(
          current?.businessProfile ?? null,
          next.businessProfile ?? undefined,
        );

        return {
          name: text(next.name) || current?.name || null,
          pushname: text(next.pushname) || current?.pushname || null,
          shortName: text(next.shortName) || current?.shortName || null,
          verifiedName:
            text(next.verifiedName) || current?.verifiedName || null,
          about: text(next.about) || current?.about || null,
          isBusiness: Boolean(current?.isBusiness || next.isBusiness),
          isEnterprise: Boolean(current?.isEnterprise || next.isEnterprise),
          isWAContact: next.isWAContact ?? current?.isWAContact,
          isMyContact: Boolean(current?.isMyContact || next.isMyContact),
          businessProfile,
        };
      };

      let merged: Merged | null = null;

      const wwebjs = win.WWebJS as
        | {
            getContact?: (
              contactId: string,
            ) => Promise<Record<string, unknown>>;
            getChat?: (
              chatId: string,
            ) => Promise<Record<string, unknown> | null>;
            getContacts?: () => Promise<Array<Record<string, unknown>>>;
          }
        | undefined;

      const fromSerializedBusiness = (
        raw: Record<string, unknown> | null | undefined,
      ): BizShape | null => {
        if (!raw || typeof raw !== "object") {
          return null;
        }
        return raw as BizShape;
      };

      // Mirror WhatsApp Web: USync + findOrCreateLatestChat hydrates pushname.
      try {
        const widFactory = win.require("WAWebWidFactory") as {
          createWid: (value: string) => { user?: string };
        };
        const phoneWid = widFactory.createWid(`${digits}@c.us`);

        try {
          const syncUtils = win.require("WAWebContactSyncUtils") as {
            constructUsyncDeltaQuery: (
              actions: Array<{ type: string; phoneNumber: string }>,
            ) => { execute: () => Promise<unknown> };
          };
          const query = syncUtils.constructUsyncDeltaQuery([
            { type: "add", phoneNumber: phoneWid.user || digits },
          ]);
          await query.execute();
        } catch {
          // USync unavailable in this WhatsApp Web build.
        }

        try {
          const findChatAction = win.require("WAWebFindChatAction") as {
            findOrCreateLatestChat: (
              wid: unknown,
            ) => Promise<{ chat?: Record<string, unknown> } | null>;
          };
          await findChatAction.findOrCreateLatestChat(phoneWid);
        } catch {
          // Chat bootstrap unavailable.
        }

        if (wwebjs?.getChat) {
          try {
            const chat = await wwebjs.getChat(`${digits}@c.us`);
            const chatName =
              text(chat?.formattedTitle) ||
              text(chat?.name) ||
              text(chat?.pushname);
            if (chatName) {
              merged = merge(merged, { pushname: chatName });
            }
          } catch {
            // Chat may still not exist until hydration completes.
          }
        }
      } catch {
        // Server hydration skipped.
      }

      if (wwebjs?.getContacts) {
        try {
          const contacts = await wwebjs.getContacts();
          for (const contact of contacts) {
            const record = contact as {
              userid?: string;
              id?: { user?: string };
              pushname?: string;
              name?: string;
              verifiedName?: string;
              shortName?: string;
            };
            if (record.userid !== digits && record.id?.user !== digits) {
              continue;
            }
            merged = merge(merged, {
              pushname: text(record.pushname),
              name: text(record.name),
              verifiedName: text(record.verifiedName),
              shortName: text(record.shortName),
            });
          }
        } catch {
          // Contacts list unavailable.
        }
      }

      try {
        const widFactory = win.require("WAWebWidFactory") as {
          createWid: (value: string) => unknown;
        };
        const existsJob = win.require("WAWebQueryExistsJob") as {
          queryWidExists: (
            wid: unknown,
          ) => Promise<Record<string, unknown> | null>;
        };
        const apiContact = win.require("WAWebApiContact") as {
          warmUpLidPnMapping?: (wid: unknown) => void;
        };

        for (const id of ids) {
          try {
            const wid = widFactory.createWid(id);
            apiContact.warmUpLidPnMapping?.(wid);

            const exists = await existsJob.queryWidExists(wid);
            if (!exists) {
              continue;
            }

            if (exists.biz === true) {
              merged = merge(merged, { isBusiness: true });
            }

            const bizInfo = exists.bizInfo as
              | {
                  verifiedName?: { name?: string };
                }
              | undefined;
            const existsVerifiedName = text(bizInfo?.verifiedName?.name);
            if (existsVerifiedName) {
              merged = merge(merged, {
                verifiedName: existsVerifiedName,
                isBusiness: Boolean(exists.biz) || merged?.isBusiness,
              });
            }
          } catch {
            // Try the next identifier format.
          }
        }
      } catch {
        // Exists job unavailable in this WhatsApp Web build.
      }

      if (wwebjs?.getChat) {
        for (const id of ids) {
          try {
            const chat = await wwebjs.getChat(id);
            const chatName =
              text(chat?.name) ||
              text(chat?.formattedTitle) ||
              text(chat?.pushname);
            if (chatName) {
              merged = merge(merged, { pushname: chatName });
            }
          } catch {
            // Chat may not exist until there has been a conversation.
          }
        }
      }

      if (wwebjs?.getContact) {
        for (const id of ids) {
          try {
            const contact = await wwebjs.getContact(id);
            const business = fromSerializedBusiness(
              contact.businessProfile as Record<string, unknown> | undefined,
            );
            merged = merge(merged, {
              name: text(contact.name),
              pushname: text(contact.pushname),
              shortName: text(contact.shortName),
              verifiedName: text(contact.verifiedName),
              isBusiness: Boolean(contact.isBusiness),
              isEnterprise: Boolean(contact.isEnterprise),
              isWAContact:
                typeof contact.isWAContact === "boolean"
                  ? contact.isWAContact
                  : undefined,
              isMyContact: Boolean(contact.isMyContact),
              businessProfile: business
                ? {
                    tag: text(business.tag),
                    description: text(business.description),
                    categories: (business.categories || [])
                      .map((item) => item.localized_display_name)
                      .filter((value): value is string => Boolean(value)),
                    email: text(business.email),
                    website: business.website || [],
                    address: text(business.address),
                  }
                : null,
            });
          } catch {
            // Try the next identifier format.
          }
        }
      }

      try {
        const collections = win.require("WAWebCollections") as {
          Contact?: {
            find: (value: unknown) => Promise<Record<string, unknown>>;
          };
          BusinessProfile?: {
            find: (value: unknown) => Promise<Record<string, unknown>>;
          };
        };
        const widFactory = win.require("WAWebWidFactory") as {
          createWid: (value: string) => unknown;
        };
        const contactGetters = win.require("WAWebContactGetters") as {
          getPushname: (contact: unknown) => string;
          getVerifiedName: (contact: unknown) => string;
          getName: (contact: unknown) => string;
          getShortName: (contact: unknown) => string;
          getIsWAContact: (contact: unknown) => boolean;
          getIsEnterprise: (contact: unknown) => boolean;
        };
        const frontendGetters = win.require(
          "WAWebFrontendContactGetters",
        ) as {
          getIsMyContact: (contact: unknown) => boolean;
        };

        for (const id of ids) {
          try {
            const wid = widFactory.createWid(id);
            const contact = await collections.Contact?.find(wid);
            if (!contact) {
              continue;
            }

            merged = merge(merged, {
              name: text(contactGetters.getName(contact)),
              pushname: text(contactGetters.getPushname(contact)),
              shortName: text(contactGetters.getShortName(contact)),
              verifiedName: text(contactGetters.getVerifiedName(contact)),
              isBusiness: Boolean(contact.isBusiness),
              isEnterprise: contactGetters.getIsEnterprise(contact),
              isWAContact: contactGetters.getIsWAContact(contact),
              isMyContact: frontendGetters.getIsMyContact(contact),
            });
          } catch {
            // Try the next identifier format.
          }
        }

        for (const id of ids) {
          try {
            const wid = widFactory.createWid(id);
            const biz = await collections.BusinessProfile?.find(wid);
            if (!biz?.profileOptions) {
              continue;
            }

            const serialized =
              typeof (biz as { serialize?: () => Record<string, unknown> })
                .serialize === "function"
                ? (biz as { serialize: () => Record<string, unknown> }).serialize()
                : biz;
            const business = fromSerializedBusiness(serialized);

            merged = merge(merged, {
              isBusiness: true,
              businessProfile: business
                ? {
                    tag: text(business.tag),
                    description: text(business.description),
                    categories: (business.categories || [])
                      .map((item) => item.localized_display_name)
                      .filter((value): value is string => Boolean(value)),
                    email: text(business.email),
                    website: business.website || [],
                    address: text(business.address),
                  }
                : null,
            });
          } catch {
            // Try the next identifier format.
          }
        }
      } catch {
        // Contact collections unavailable in this WhatsApp Web build.
      }

      try {
        const widFactory = win.require("WAWebWidFactory") as {
          createWid: (value: string) => unknown;
        };
        const statusBridge = win.require("WAWebContactStatusBridge") as {
          getStatus: (args: {
            token: string;
            wid: unknown;
          }) => Promise<{ status?: string }>;
        };

        for (const id of ids) {
          try {
            const wid = widFactory.createWid(id);
            const status = await statusBridge.getStatus({ token: "", wid });
            const about = text(status?.status);
            if (about) {
              merged = merge(merged, { about });
              break;
            }
          } catch {
            // Try the next identifier format.
          }
        }
      } catch {
        // Status bridge unavailable.
      }

      return merged;
    },
    { digits: phoneDigits, resolved: resolvedId },
  );
}

function applyContactMetadata(
  details: ProfileDetails,
  metadata: PageContactMetadata | null,
): void {
  if (!metadata) {
    return;
  }

  const businessProfile = extractBusinessProfile(metadata.businessProfile);

  details.name = sanitizePersonName(metadata.name);
  details.pushname = sanitizePersonName(metadata.pushname);
  details.shortName = sanitizePersonName(metadata.shortName);
  details.verifiedName = sanitizePersonName(metadata.verifiedName);
  details.about = metadata.about || null;
  details.isBusiness = metadata.isBusiness ?? false;
  details.isEnterprise = metadata.isEnterprise ?? false;
  details.isWAContact = metadata.isWAContact;
  details.isMyContact = metadata.isMyContact;
  details.businessProfile = businessProfile;
  details.displayName = pickDisplayName(metadata, businessProfile);
  details.accountType = resolveAccountType(metadata, businessProfile);

  if (businessProfile?.description && !details.isBusiness) {
    details.isBusiness = true;
    details.accountType = resolveAccountType(details, businessProfile);
  }
}

/**
 * Fetch a profile picture without opening a chat (avoids "No LID for user").
 * Never throws WhatsApp's minified page exceptions to the API layer.
 */
export async function lookupProfilePicture(
  phoneDigits: string,
): Promise<ProfilePicLookup> {
  const client = await getWhatsAppClient();
  const page = client.pupPage;
  if (!page) {
    return {
      url: null,
      resolvedId: null,
      error: "WhatsApp browser page is not available",
    };
  }

  const jid = `${phoneDigits}@c.us`;

  type PageLookupResult = {
    url: string | null;
    resolvedId: string | null;
    error: string | null;
  };

  const result = await page.evaluate(async (id: string): Promise<PageLookupResult> => {
    const win = window as unknown as {
      require: (name: string) => Record<string, unknown>;
    };

    const errText = (value: unknown): string => {
      if (value instanceof Error && value.message) {
        return value.message;
      }
      if (typeof value === "string") {
        return value;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return "Unknown WhatsApp error";
      }
    };

    const load = (name: string): Record<string, unknown> | null => {
      try {
        return win.require(name);
      } catch {
        return null;
      }
    };

    const picUrl = (pic: unknown): string | null => {
      if (!pic || typeof pic !== "object") {
        return null;
      }
      const record = pic as Record<string, unknown>;
      for (const key of ["eurl", "imgFull", "previewEurl", "img"]) {
        if (typeof record[key] === "string" && record[key]) {
          return record[key] as string;
        }
      }
      return null;
    };

    try {
      const widFactory = load("WAWebWidFactory");
      const createWid = widFactory?.createWid as
        | ((value: string) => { _serialized?: string })
        | undefined;
      if (!createWid) {
        return {
          url: null,
          resolvedId: id,
          error: "WhatsApp WID factory is unavailable",
        };
      }

      let targetWid: { _serialized?: string } = createWid(id);

      const existsJob = load("WAWebQueryExistsJob");
      const queryWidExists = existsJob?.queryWidExists as
        | ((wid: unknown) => Promise<{ wid?: { _serialized?: string } } | null>)
        | undefined;
      if (queryWidExists) {
        try {
          const exists = await queryWidExists(targetWid);
          if (exists?.wid) {
            targetWid = exists.wid;
          }
        } catch {
          // LID-era exists queries often throw minified errors; keep the original WID.
        }
      }

      const apiContact = load("WAWebApiContact");
      const getCurrentLid = apiContact?.getCurrentLid as
        | ((wid: unknown) => { _serialized?: string } | undefined)
        | undefined;
      if (getCurrentLid) {
        try {
          const lid = getCurrentLid(targetWid);
          if (lid) {
            targetWid = lid;
          }
        } catch {
          // ignore
        }
      }

      const collections = load("WAWebCollections");
      const thumbs = collections?.ProfilePicThumb as
        | {
            get: (value: unknown) => unknown;
            find: (value: unknown) => Promise<unknown>;
          }
        | undefined;

      let thumb: unknown = null;
      if (thumbs) {
        try {
          thumb =
            thumbs.get(targetWid) ||
            thumbs.get(id) ||
            thumbs.get(targetWid._serialized) ||
            (await thumbs.find(targetWid));
        } catch {
          thumb = null;
        }
      }

      let url = picUrl(thumb);
      if (url) {
        return {
          url,
          resolvedId: targetWid._serialized || id,
          error: null,
        };
      }

      const bridge = load("WAWebContactProfilePicThumbBridge");
      const requestPic = bridge?.requestProfilePicFromServer as
        | ((value: unknown) => Promise<unknown>)
        | undefined;
      if (requestPic) {
        try {
          const fromServer = await requestPic(thumb || targetWid);
          url = picUrl(fromServer);
          if (url) {
            return {
              url,
              resolvedId: targetWid._serialized || id,
              error: null,
            };
          }
        } catch (error) {
          const message = errText(error);
          if (message && message.length > 2) {
            return {
              url: null,
              resolvedId: targetWid._serialized || id,
              error: message,
            };
          }
        }
      }

      return {
        url: null,
        resolvedId: targetWid._serialized || id,
        error: null,
      };
    } catch (error) {
      return {
        url: null,
        resolvedId: id,
        error: errText(error),
      };
    }
  }, jid);

  return result;
}

/**
 * Fetch profile picture plus contact metadata (name, about, business info).
 */
export async function lookupProfileDetails(
  phoneDigits: string,
): Promise<ProfileDetails> {
  const picResult = await lookupProfilePicture(phoneDigits);
  const resolvedId = picResult.resolvedId || `${phoneDigits}@c.us`;

  const details: ProfileDetails = { ...picResult };

  let metadata: PageContactMetadata | null = null;
  try {
    metadata = await lookupContactMetadata(phoneDigits, resolvedId);
    applyContactMetadata(details, metadata);
  } catch (error: unknown) {
    console.warn(
      `Contact metadata lookup failed for ${phoneDigits}:`,
      getErrorMessage(error),
    );
  }

  if (!details.displayName && !details.pushname) {
    try {
      const page = (await getWhatsAppClient()).pupPage;
      if (page) {
        const { probePushnameViaProfileView } = await import(
          "@/lib/profile-probe"
        );
        const probe = await probePushnameViaProfileView(
          page,
          phoneDigits,
          picResult.resolvedId,
        );
        if (probe.pushname || probe.verifiedName || probe.name) {
          applyContactMetadata(details, {
            ...(metadata || {}),
            pushname: probe.pushname ?? metadata?.pushname ?? null,
            verifiedName: probe.verifiedName ?? metadata?.verifiedName ?? null,
            name: probe.name ?? metadata?.name ?? null,
          });
        }
      }
    } catch (error: unknown) {
      console.warn(
        `Profile probe failed for ${phoneDigits}:`,
        getErrorMessage(error),
      );
    }
  }

  return details;
}

export type ProfileDiagnostic = {
  phoneDigits: string;
  resolvedId: string | null;
  profilePic: ProfilePicLookup;
  mergedMetadata: PageContactMetadata | null;
  profileProbe?: import("@/lib/profile-probe").ProfileProbeResult;
  probes: Array<{
    id: string;
    source: string;
    ok: boolean;
    data?: unknown;
    error?: string;
  }>;
};

/**
 * Deep diagnostic: returns raw WhatsApp internal responses for troubleshooting.
 */
export async function diagnoseProfileLookup(
  phoneDigits: string,
): Promise<ProfileDiagnostic> {
  const profilePic = await lookupProfilePicture(phoneDigits);
  const resolvedId = profilePic.resolvedId || `${phoneDigits}@c.us`;
  const mergedMetadata = await lookupContactMetadata(phoneDigits, resolvedId);

  const client = await getWhatsAppClient();
  const page = client.pupPage;
  if (!page) {
    return {
      phoneDigits,
      resolvedId,
      profilePic,
      mergedMetadata,
      probes: [
        {
          id: "page",
          source: "availability",
          ok: false,
          error: "WhatsApp browser page is not available",
        },
      ],
    };
  }

  const probes = await page.evaluate(
    async ({
      digits,
      resolved,
    }: {
      digits: string;
      resolved: string;
    }) => {
      const win = window as unknown as {
        require: (name: string) => Record<string, unknown>;
        WWebJS?: {
          getContact?: (contactId: string) => Promise<Record<string, unknown>>;
        };
      };

      const ids = Array.from(
        new Set([`${digits}@c.us`, resolved].filter(Boolean)),
      ) as string[];

      type Probe = {
        id: string;
        source: string;
        ok: boolean;
        data?: unknown;
        error?: string;
      };

      const results: Probe[] = [];

      const push = (
        id: string,
        source: string,
        ok: boolean,
        data?: unknown,
        error?: string,
      ) => {
        results.push({ id, source, ok, data, error });
      };

      const serialize = (value: unknown): unknown => {
        if (value === null || value === undefined) {
          return value;
        }
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          return value;
        }
        if (Array.isArray(value)) {
          return value.map((item) => serialize(item));
        }
        if (typeof value === "object") {
          const record = value as Record<string, unknown>;
          if (typeof record.serialize === "function") {
            try {
              return serialize(
                (record.serialize as () => unknown).call(record),
              );
            } catch {
              // Fall through to manual extraction.
            }
          }
          const output: Record<string, unknown> = {};
          for (const key of Object.keys(record)) {
            if (key.startsWith("_") && key !== "_serialized") {
              continue;
            }
            try {
              const entry = record[key];
              if (typeof entry === "function") {
                continue;
              }
              output[key] = serialize(entry);
            } catch {
              output[key] = "[unreadable]";
            }
          }
          return output;
        }
        return String(value);
      };

      const safeRequire = (name: string): Record<string, unknown> | null => {
        try {
          return win.require(name);
        } catch (error) {
          push("module", name, false, undefined, String(error));
          return null;
        }
      };

      const widFactory = safeRequire("WAWebWidFactory") as {
        createWid?: (value: string) => {
          _serialized?: string;
          server?: string;
          user?: string;
        };
      } | null;

      const existsJob = safeRequire("WAWebQueryExistsJob") as {
        queryWidExists?: (
          wid: unknown,
        ) => Promise<Record<string, unknown> | null>;
      } | null;

      const apiContact = safeRequire("WAWebApiContact") as {
        getContactRecord?: (wid: unknown) => Promise<unknown>;
        bulkGetContactRecord?: (wids: unknown[]) => Promise<unknown>;
        getPhoneNumber?: (wid: unknown) => { _serialized?: string } | undefined;
      } | null;

      for (const id of ids) {
        if (win.WWebJS?.getContact) {
          try {
            const contact = await win.WWebJS.getContact(id);
            push(id, "WWebJS.getContact", true, contact);
          } catch (error) {
            push(id, "WWebJS.getContact", false, undefined, String(error));
          }
        }

        if (!widFactory?.createWid) {
          continue;
        }

        const wid = widFactory.createWid(id);

        if (existsJob?.queryWidExists) {
          try {
            const exists = await existsJob.queryWidExists(wid);
            push(id, "WAWebQueryExistsJob.queryWidExists", true, exists);
          } catch (error) {
            push(
              id,
              "WAWebQueryExistsJob.queryWidExists",
              false,
              undefined,
              String(error),
            );
          }
        }

        if (apiContact?.getContactRecord) {
          try {
            const record = await apiContact.getContactRecord(wid);
            push(id, "WAWebApiContact.getContactRecord", true, serialize(record));
          } catch (error) {
            push(
              id,
              "WAWebApiContact.getContactRecord",
              false,
              undefined,
              String(error),
            );
          }
        }

        if (apiContact?.bulkGetContactRecord) {
          try {
            const records = await apiContact.bulkGetContactRecord([wid]);
            push(
              id,
              "WAWebApiContact.bulkGetContactRecord",
              true,
              serialize(records),
            );
          } catch (error) {
            push(
              id,
              "WAWebApiContact.bulkGetContactRecord",
              false,
              undefined,
              String(error),
            );
          }
        }

        const collections = safeRequire("WAWebCollections") as {
          Contact?: {
            find: (value: unknown) => Promise<Record<string, unknown>>;
            get?: (value: unknown) => Record<string, unknown> | undefined;
          };
          BusinessProfile?: {
            find: (value: unknown) => Promise<Record<string, unknown>>;
          };
        } | null;

        if (collections?.Contact) {
          try {
            const contact = await collections.Contact.find(wid);
            push(id, "Contact.find(serialized)", true, serialize(contact));
          } catch (error) {
            push(id, "Contact.find", false, undefined, String(error));
          }

          try {
            const cached = collections.Contact.get?.(wid);
            push(id, "Contact.get(serialized)", true, serialize(cached));
          } catch (error) {
            push(id, "Contact.get", false, undefined, String(error));
          }
        }

        const getters = safeRequire("WAWebContactGetters") as {
          getPushname?: (contact: unknown) => unknown;
          getVerifiedName?: (contact: unknown) => unknown;
          getName?: (contact: unknown) => unknown;
          getShortName?: (contact: unknown) => unknown;
          getIsWAContact?: (contact: unknown) => unknown;
          getIsEnterprise?: (contact: unknown) => unknown;
        } | null;

        if (getters && collections?.Contact) {
          try {
            const contact = await collections.Contact.find(wid);
            push(id, "WAWebContactGetters", true, {
              pushname: getters.getPushname?.(contact),
              verifiedName: getters.getVerifiedName?.(contact),
              name: getters.getName?.(contact),
              shortName: getters.getShortName?.(contact),
              isWAContact: getters.getIsWAContact?.(contact),
              isEnterprise: getters.getIsEnterprise?.(contact),
              contactKeys: contact ? Object.keys(contact) : [],
            });
          } catch (error) {
            push(id, "WAWebContactGetters", false, undefined, String(error));
          }
        }

        if (collections?.BusinessProfile) {
          try {
            const biz = await collections.BusinessProfile.find(wid);
            push(id, "BusinessProfile.find", true, serialize(biz));
          } catch (error) {
            push(id, "BusinessProfile.find", false, undefined, String(error));
          }
        }

        const statusBridge = safeRequire("WAWebContactStatusBridge") as {
          getStatus?: (args: {
            token: string;
            wid: unknown;
          }) => Promise<unknown>;
        } | null;
        if (statusBridge?.getStatus) {
          try {
            const status = await statusBridge.getStatus({ token: "", wid });
            push(id, "WAWebContactStatusBridge.getStatus", true, status);
          } catch (error) {
            push(
              id,
              "WAWebContactStatusBridge.getStatus",
              false,
              undefined,
              String(error),
            );
          }
        }
      }

      const candidateModules = [
        "WAWebMexFetchBusinessProfile",
        "WAWebBusinessProfileFetch",
        "WAWebContactUtils",
        "WAWebContactSyncUtils",
        "WAWebContactProfilePicThumbBridge",
        "WAWebApiContact",
        "WAWebFindChatAction",
      ];

      try {
        const widFactory = win.require("WAWebWidFactory") as {
          createWid: (value: string) => { user?: string };
        };
        const phoneWid = widFactory.createWid(`${digits}@c.us`);

        try {
          const syncUtils = win.require("WAWebContactSyncUtils") as {
            constructUsyncDeltaQuery: (
              actions: Array<{ type: string; phoneNumber: string }>,
            ) => { execute: () => Promise<unknown> };
          };
          const usyncResult = await syncUtils
            .constructUsyncDeltaQuery([
              { type: "add", phoneNumber: phoneWid.user || digits },
            ])
            .execute();
          push("hydrate", "WAWebContactSyncUtils.execute", true, usyncResult);
        } catch (error) {
          push(
            "hydrate",
            "WAWebContactSyncUtils.execute",
            false,
            undefined,
            String(error),
          );
        }

        try {
          const findChatAction = win.require("WAWebFindChatAction") as {
            findOrCreateLatestChat: (
              wid: unknown,
            ) => Promise<{ chat?: Record<string, unknown> } | null>;
          };
          const chatResult =
            await findChatAction.findOrCreateLatestChat(phoneWid);
          const chat = chatResult?.chat as Record<string, unknown> | undefined;
          push(
            "hydrate",
            "WAWebFindChatAction.findOrCreateLatestChat",
            true,
            serialize(chatResult),
          );
          if (chat) {
            push("hydrate", "chat.rawFields", true, {
              formattedTitle: chat.formattedTitle,
              name: chat.name,
              pushname: chat.pushname,
              contact: serialize(chat.contact),
            });

            try {
              const frontendChatGetters = win.require(
                "WAWebFrontendChatGetters",
              ) as {
                getContact: (chatModel: unknown) => unknown;
              };
              const chatGetters = win.require("WAWebChatGetters") as {
                getFormattedTitle?: (chatModel: unknown) => string;
                getNotifyName?: (chatModel: unknown) => string;
                getName?: (chatModel: unknown) => string;
              };
              const chatContact = frontendChatGetters.getContact(chat);
              const contactGetters = win.require("WAWebContactGetters") as {
                getPushname: (contact: unknown) => string;
                getVerifiedName: (contact: unknown) => string;
                getName: (contact: unknown) => string;
              };
              push("hydrate", "frontendChatGetters", true, {
                formattedTitle: chatGetters.getFormattedTitle?.(chat),
                notifyName: chatGetters.getNotifyName?.(chat),
                chatName: chatGetters.getName?.(chat),
                contactPushname: contactGetters.getPushname(chatContact),
                contactVerifiedName:
                  contactGetters.getVerifiedName(chatContact),
                contactName: contactGetters.getName(chatContact),
                chatContact: serialize(chatContact),
              });
            } catch (error) {
              push(
                "hydrate",
                "frontendChatGetters",
                false,
                undefined,
                String(error),
              );
            }
          }
        } catch (error) {
          push(
            "hydrate",
            "WAWebFindChatAction.findOrCreateLatestChat",
            false,
            undefined,
            String(error),
          );
        }

        const diagnoseWwebjs = win.WWebJS as
          | {
              getChat?: (
                chatId: string,
              ) => Promise<Record<string, unknown> | null>;
            }
          | undefined;

        if (diagnoseWwebjs?.getChat) {
          try {
            const chat = await diagnoseWwebjs.getChat(`${digits}@c.us`);
            push("hydrate", "WWebJS.getChat.afterSync", true, chat);
          } catch (error) {
            push(
              "hydrate",
              "WWebJS.getChat.afterSync",
              false,
              undefined,
              String(error),
            );
          }
        }

        try {
          const contactUtils = win.require("WAWebContactUtils") as {
            getContactDataFromContactModel?: (contact: unknown) => unknown;
          };
          const collections = win.require("WAWebCollections") as {
            Contact?: {
              find: (value: unknown) => Promise<Record<string, unknown>>;
            };
          };
          const contactGetters = win.require("WAWebContactGetters") as {
            getPushname: (contact: unknown) => string;
            getVerifiedName: (contact: unknown) => string;
            getName: (contact: unknown) => string;
          };
          const contact = await collections.Contact?.find(phoneWid);
          if (contact) {
            push("hydrate", "ContactGetters.afterSync", true, {
              pushname: contactGetters.getPushname(contact),
              verifiedName: contactGetters.getVerifiedName(contact),
              name: contactGetters.getName(contact),
            });
          }
          if (contact && contactUtils.getContactDataFromContactModel) {
            push(
              "hydrate",
              "WAWebContactUtils.getContactDataFromContactModel",
              true,
              serialize(contactUtils.getContactDataFromContactModel(contact)),
            );
          }
        } catch (error) {
          push(
            "hydrate",
            "WAWebContactUtils.getContactDataFromContactModel",
            false,
            undefined,
            String(error),
          );
        }
      } catch (error) {
        push("hydrate", "hydration-block", false, undefined, String(error));
      }

      try {
        const req = win.require as unknown as {
          m?: Record<string, unknown>;
          c?: Record<string, unknown>;
        };
        const moduleNames = Object.keys(req.m || req.c || {}).filter((name) =>
          /contact|profile|pushname|usync|formatted/i.test(name),
        );
        push(
          "modules",
          "contact-related-webpack-modules",
          true,
          moduleNames.slice(0, 80),
        );
      } catch (error) {
        push(
          "modules",
          "contact-related-webpack-modules",
          false,
          undefined,
          String(error),
        );
      }

      const profileModuleCandidates = [
        "WAWebContactInfoController",
        "WAWebContactInfoAction",
        "WAWebContactProfileAction",
        "WAWebOpenContactInfoAction",
        "WAWebLoadContactProfileAction",
        "WAWebMexFetchProfileDataQuery",
        "WAWebMexFetchUserProfileQuery",
        "WAWebFrontendChatGetters",
        "WAWebChatGetters",
        "WAWebContactFormattable",
        "WAWebMexFetchBusinessProfileQuery",
        "WAWebContactSyncAction",
        "WAWebSyncContactJob",
        "WAWebContactProfileController",
      ];

      try {
        const widFactory = win.require("WAWebWidFactory") as {
          createWid: (value: string) => unknown;
        };
        const phoneWid = widFactory.createWid(`${digits}@c.us`);
        const lidWid = resolved
          ? widFactory.createWid(resolved)
          : phoneWid;

        for (const moduleName of profileModuleCandidates) {
          try {
            const mod = win.require(moduleName) as Record<string, unknown>;
            const fnNames = Object.keys(mod).filter(
              (key) =>
                typeof mod[key] === "function" &&
                /fetch|load|open|query|get|request|sync|profile|contact/i.test(
                  key,
                ),
            );
            push("profile-module", moduleName, true, fnNames);

            for (const fnName of fnNames.slice(0, 5)) {
              try {
                const fn = mod[fnName] as (
                  ...args: unknown[]
                ) => unknown | Promise<unknown>;
                const result = await fn(phoneWid, lidWid, { wid: phoneWid });
                push(
                  "profile-call",
                  `${moduleName}.${fnName}`,
                  true,
                  serialize(result),
                );
              } catch (error) {
                push(
                  "profile-call",
                  `${moduleName}.${fnName}`,
                  false,
                  undefined,
                  String(error).slice(0, 180),
                );
              }
            }
          } catch {
            push("profile-module", moduleName, false);
          }
        }
      } catch (error) {
        push("profile-module", "scan", false, undefined, String(error));
      }

      try {
        const widFactory = win.require("WAWebWidFactory") as {
          createWid: (value: string) => { user?: string };
        };
        const phoneWid = widFactory.createWid(`${digits}@c.us`);
        if (
          (
            win.WWebJS as
              | {
                  getContacts?: () => Promise<Array<Record<string, unknown>>>;
                }
              | undefined
          )?.getContacts
        ) {
          const contacts = await (
            win.WWebJS as {
              getContacts: () => Promise<Array<Record<string, unknown>>>;
            }
          ).getContacts();
          const match = contacts.find((contact) => {
            const record = contact as {
              userid?: string;
              id?: { user?: string };
            };
            return (
              record.userid === digits || record.id?.user === digits
            );
          }) as Record<string, unknown> | undefined;
          push("contacts-scan", "WWebJS.getContacts", true, match ?? null);
        }
        push("contacts-scan", "phoneWid", true, phoneWid);
      } catch (error) {
        push("contacts-scan", "WWebJS.getContacts", false, undefined, String(error));
      }

      for (const moduleName of candidateModules) {
        const mod = safeRequire(moduleName);
        if (mod) {
          push(
            "module",
            moduleName,
            true,
            Object.keys(mod).filter((key) => typeof mod[key] === "function"),
          );
        }
      }

      return results;
    },
    { digits: phoneDigits, resolved: resolvedId },
  );

  let profileProbe: ProfileDiagnostic["profileProbe"];
  try {
    const { probePushnameViaProfileView } = await import("@/lib/profile-probe");
    profileProbe = await probePushnameViaProfileView(
      page,
      phoneDigits,
      resolvedId,
    );
  } catch (error: unknown) {
    profileProbe = {
      pushname: null,
      verifiedName: null,
      name: null,
      domName: null,
      attempts: [`probe.error:${getErrorMessage(error)}`],
      captures: [],
      contactAfterProbe: {
        pushname: null,
        verifiedName: null,
        name: null,
      },
    };
  }

  return {
    phoneDigits,
    resolvedId,
    profilePic,
    mergedMetadata,
    profileProbe,
    probes,
  };
}
