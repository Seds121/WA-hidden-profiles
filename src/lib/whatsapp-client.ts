import "server-only";

import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";
import { getErrorMessage } from "@/lib/errors";

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
