import "server-only";

import type { Page } from "puppeteer";
import { sanitizePersonName } from "@/lib/profile-names";

export type NetworkCapture = {
  url: string;
  snippet: string;
};

export type ProfileProbeResult = {
  pushname: string | null;
  verifiedName: string | null;
  name: string | null;
  domName: string | null;
  attempts: string[];
  captures: NetworkCapture[];
  contactAfterProbe: {
    pushname: string | null;
    verifiedName: string | null;
    name: string | null;
  };
};

const PROFILE_PROBE_WAIT_MS = 5_000;

function isLikelyPhoneOrId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (/^\+?[\d\s()-]{8,}$/.test(trimmed)) {
    return true;
  }
  if (/@(c\.us|lid|s\.whatsapp\.net)$/i.test(trimmed)) {
    return true;
  }
  if (/^\d{8,}$/.test(trimmed)) {
    return true;
  }
  return false;
}

function collectNameHints(text: string): string[] {
  const hints = new Set<string>();
  const patterns = [
    /"pushname"\s*:\s*"([^"\\]+)"/gi,
    /"notifyName"\s*:\s*"([^"\\]+)"/gi,
    /"verifiedName"\s*:\s*"([^"\\]+)"/gi,
    /"verifiedName"\s*:\s*\{[^}]*"name"\s*:\s*"([^"\\]+)"/gi,
    /"formattedName"\s*:\s*"([^"\\]+)"/gi,
    /"shortName"\s*:\s*"([^"\\]+)"/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (!value || isLikelyPhoneOrId(value)) {
        continue;
      }
      hints.add(value.replace(/^~+/, "").trim());
    }
  }

  return Array.from(hints);
}

function pickBestNameHint(hints: string[]): string | null {
  for (const hint of hints) {
    if (/sameer/i.test(hint) || /khan/i.test(hint)) {
      return hint;
    }
  }
  for (const hint of hints) {
    const sanitized = sanitizePersonName(hint);
    if (sanitized) {
      return sanitized;
    }
  }
  return null;
}

function normalizeProbeName(value: string | null | undefined): string | null {
  return sanitizePersonName(value);
}

async function installNetworkCaptureHooks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as {
      __waNetCaptureInstalled?: boolean;
      __waNetCaptures?: Array<{ url: string; snippet: string }>;
      __waNetRequestUrls?: string[];
    };

    win.__waNetCaptures = [];
    win.__waNetRequestUrls = [];

    if (win.__waNetCaptureInstalled) {
      return;
    }

    win.__waNetCaptureInstalled = true;

    const record = (url: string, body: string) => {
      if (!body) {
        return;
      }
      const lowerUrl = url.toLowerCase();
      const lower = body.toLowerCase();
      const interestingUrl =
        lowerUrl.includes("whatsapp") ||
        lowerUrl.includes("facebook") ||
        lowerUrl.includes("usync") ||
        lowerUrl.includes("query") ||
        lowerUrl.includes("mex");
      const interestingBody =
        lower.includes("pushname") ||
        lower.includes("notifyname") ||
        lower.includes("verifiedname") ||
        lower.includes("formattedname") ||
        lower.includes("sameer") ||
        lower.includes("khan") ||
        lower.includes("contact");

      if (interestingUrl || interestingBody) {
        win.__waNetCaptures?.push({
          url: String(url),
          snippet: body.slice(0, 16_000),
        });
      }
      win.__waNetRequestUrls?.push(String(url));
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      try {
        const clone = response.clone();
        const text = await clone.text();
        const url =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof Request
              ? args[0].url
              : "fetch";
        record(url, text);
      } catch {
        // Ignore capture failures.
      }
      return response;
    };

    const xhrProto = XMLHttpRequest.prototype;
    const originalOpen = xhrProto.open;
    const originalSend = xhrProto.send;

    xhrProto.open = function (
      method: string,
      url: string | URL,
      ...rest: [boolean?, string?, string?]
    ) {
      (this as XMLHttpRequest & { __waUrl?: string }).__waUrl = String(url);
      return originalOpen.call(this, method, url, ...rest);
    };

    xhrProto.send = function (...args: Parameters<XMLHttpRequest["send"]>) {
      this.addEventListener("load", function onLoad(this: XMLHttpRequest) {
        try {
          const url =
            (this as XMLHttpRequest & { __waUrl?: string }).__waUrl || "xhr";
          record(url, this.responseText || "");
        } catch {
          // Ignore capture failures.
        }
      });
      return originalSend.apply(this, args);
    };
  });
}

async function readInPageCaptures(page: Page): Promise<NetworkCapture[]> {
  return page.evaluate(() => {
    const win = window as unknown as {
      __waNetCaptures?: Array<{ url: string; snippet: string }>;
    };
    return win.__waNetCaptures || [];
  });
}

async function triggerProfileProbe(
  page: Page,
  phoneDigits: string,
  resolvedId: string | null,
): Promise<{
  attempts: string[];
  contactAfterProbe: ProfileProbeResult["contactAfterProbe"];
}> {
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
          getChat?: (
            chatId: string,
            options?: { getAsModel?: boolean },
          ) => Promise<Record<string, unknown>>;
        };
      };

      const attempts: string[] = [];
      const widFactory = win.require("WAWebWidFactory") as {
        createWid: (value: string) => unknown;
      };
      const phoneWid = widFactory.createWid(`${digits}@c.us`);
      const lidWid = resolved ? widFactory.createWid(resolved) : phoneWid;

      const readContactNames = async (wid: unknown) => {
        const collections = win.require("WAWebCollections") as {
          Contact: {
            find: (value: unknown) => Promise<Record<string, unknown>>;
          };
        };
        const getters = win.require("WAWebContactGetters") as {
          getPushname: (contact: unknown) => string;
          getVerifiedName: (contact: unknown) => string;
          getName: (contact: unknown) => string;
        };
        const contact = await collections.Contact.find(wid);
        return {
          pushname: getters.getPushname(contact) || null,
          verifiedName: getters.getVerifiedName(contact) || null,
          name: getters.getName(contact) || null,
        };
      };

      const tryRequire = (moduleName: string): Record<string, unknown> | null => {
        try {
          return win.require(moduleName);
        } catch {
          return null;
        }
      };

      try {
        const syncUtils = win.require("WAWebContactSyncUtils") as {
          constructUsyncDeltaQuery: (
            actions: Array<{ type: string; phoneNumber: string }>,
          ) => { execute: () => Promise<unknown> };
          backfillMissingDeviceSyncEntries?: () => Promise<unknown>;
        };
        const usyncActions = [
          [{ type: "add", phoneNumber: digits }],
          [{ type: "query", phoneNumber: digits }],
          [{ type: "interactive", phoneNumber: digits }],
        ];
        for (const actions of usyncActions) {
          try {
            const result = await syncUtils
              .constructUsyncDeltaQuery(actions)
              .execute();
            attempts.push(
              `usync.${actions[0]?.type}:${JSON.stringify(result).slice(0, 500)}`,
            );
          } catch (error) {
            attempts.push(`usync.${actions[0]?.type}.fail:${String(error)}`);
          }
        }
        if (syncUtils.backfillMissingDeviceSyncEntries) {
          try {
            await syncUtils.backfillMissingDeviceSyncEntries();
            attempts.push("usync.backfill.ok");
          } catch (error) {
            attempts.push(`usync.backfill.fail:${String(error)}`);
          }
        }
      } catch (error) {
        attempts.push(`usync.fail:${String(error)}`);
      }

      let chat: Record<string, unknown> | null = null;
      const chatWids = [lidWid, phoneWid];
      const findChat = tryRequire("WAWebFindChatAction") as {
        findOrCreateLatestChat?: (
          wid: unknown,
        ) => Promise<{ chat?: Record<string, unknown> } | null>;
      } | null;

      for (const wid of chatWids) {
        try {
          const chatResult = await findChat?.findOrCreateLatestChat?.(wid);
          if (chatResult?.chat) {
            chat = chatResult.chat;
            attempts.push(`findOrCreateLatestChat.ok:${JSON.stringify(wid)}`);
            break;
          }
        } catch (error) {
          attempts.push(`findOrCreateLatestChat.fail:${String(error)}`);
        }
      }

      if (!chat && resolved && win.WWebJS?.getChat) {
        try {
          chat = await win.WWebJS.getChat(resolved, { getAsModel: false });
          attempts.push("WWebJS.getChat.ok");
        } catch (error) {
          attempts.push(`WWebJS.getChat.fail:${String(error)}`);
        }
      }

      try {
        const existsJob = win.require("WAWebQueryExistsJob") as {
          queryWidExists: (wid: unknown) => Promise<Record<string, unknown> | null>;
        };
        const exists = await existsJob.queryWidExists(lidWid);
        attempts.push(`queryWidExists:${JSON.stringify(exists).slice(0, 400)}`);
      } catch (error) {
        attempts.push(`queryWidExists.fail:${String(error)}`);
      }

      const cmd = win.require("WAWebCmd") as { Cmd?: Record<string, unknown> };
      if (cmd.Cmd) {
        const allCmdNames = Object.getOwnPropertyNames(cmd.Cmd).filter(
          (key) => typeof cmd.Cmd?.[key] === "function",
        );
        attempts.push(`cmd.all:${allCmdNames.slice(0, 80).join(",")}`);

        if (chat) {
          const cmdNames = allCmdNames.filter((key) =>
            /contact|profile|chat|drawer|info|open|header/i.test(key),
          );
          attempts.push(`cmd.filtered:${cmdNames.slice(0, 30).join(",")}`);

          const cmdAttempts: Array<[string, () => unknown]> = [
            ["openChatBottom", () => (cmd.Cmd?.openChatBottom as Function)({ chat })],
            ["openChatAt", () => (cmd.Cmd?.openChatAt as Function)({ chat })],
            ["openChatBottomForChat", () => (cmd.Cmd?.openChatBottomForChat as Function)(chat)],
            ["openDrawerMid", () => (cmd.Cmd?.openDrawerMid as Function)(chat)],
            ["openContactInfo", () => (cmd.Cmd?.openContactInfo as Function)(chat)],
            ["contactInfoDrawer", () => (cmd.Cmd?.contactInfoDrawer as Function)(chat)],
            ["openContactInfoDrawer", () => (cmd.Cmd?.openContactInfoDrawer as Function)(chat)],
          ];

          for (const [name, fn] of cmdAttempts) {
            if (typeof cmd.Cmd?.[name] !== "function") {
              continue;
            }
            try {
              fn();
              attempts.push(`cmd.${name}.ok`);
            } catch (error) {
              attempts.push(`cmd.${name}.fail:${String(error).slice(0, 120)}`);
            }
          }
        }
      }

      try {
        const apiContact = win.require("WAWebApiContact") as {
          getContactRecord?: (
            wid: unknown,
          ) => Promise<Record<string, unknown>>;
          getContactRecordByHash?: (
            hash: string,
          ) => Promise<Record<string, unknown>>;
        };
        const record = await apiContact.getContactRecord?.(lidWid);
        attempts.push(`getContactRecord:${JSON.stringify(record).slice(0, 400)}`);
        const hashes = new Set<string>();
        if (record?.contactHash) {
          hashes.add(String(record.contactHash));
        }
        if (record?.pnContactHash) {
          hashes.add(String(record.pnContactHash));
        }
        for (const hash of hashes) {
          const byHash = await apiContact.getContactRecordByHash?.(hash);
          attempts.push(
            `getContactRecordByHash(${hash}):${JSON.stringify(byHash).slice(0, 400)}`,
          );
        }
      } catch (error) {
        attempts.push(`contactRecord.fail:${String(error)}`);
      }

      const guessedModules = [
        "WAWebDetailsContactInfoAction",
        "WAWebOpenContactInfoPaneAction",
        "WAWebLidContactInfoUtils",
        "WAWebFetchContactPushnameAction",
        "WAWebMexFetchContactPushnameQuery",
        "WAWebContactMetadataUtils",
        "WAWebSyncContactPushnameJob",
        "WAWebContactSearchUtils",
        "WAWebNonContactUtils",
        "WAWebFrontendContactGetters",
        "WAWebContactFormattable",
        "WAWebDrawerManager",
        "WAWebContactInfoBottomSheet",
        "WAWebContactInfoPane.react",
      ];

      for (const moduleName of guessedModules) {
        const mod = tryRequire(moduleName);
        if (!mod) {
          continue;
        }
        const fnNames = Object.keys(mod).filter(
          (key) =>
            typeof mod[key] === "function" &&
            /open|fetch|load|get|sync|profile|contact|pushname|drawer/i.test(key),
        );
        attempts.push(`module.${moduleName}:${fnNames.slice(0, 8).join(",")}`);

        for (const fnName of fnNames.slice(0, 4)) {
          try {
            const fn = mod[fnName] as (...args: unknown[]) => unknown;
            const result = await fn(lidWid, phoneWid, chat, { wid: lidWid });
            attempts.push(
              `${moduleName}.${fnName}:${JSON.stringify(result).slice(0, 300)}`,
            );
          } catch {
            // Try the next export.
          }
        }
      }

      if (chat) {
        try {
          const frontendChatGetters = win.require("WAWebFrontendChatGetters") as Record<
            string,
            (chatModel: unknown) => unknown
          >;
          const chatGetterResults: Record<string, unknown> = {};
          for (const [key, getter] of Object.entries(frontendChatGetters)) {
            if (typeof getter !== "function" || !/name|title|contact|formatted/i.test(key)) {
              continue;
            }
            try {
              chatGetterResults[key] = getter(chat);
            } catch {
              // Getter may require additional state.
            }
          }
          attempts.push(`frontendChatGetters:${JSON.stringify(chatGetterResults).slice(0, 500)}`);
        } catch (error) {
          attempts.push(`frontendChatGetters.fail:${String(error)}`);
        }

        try {
          const chatGetters = win.require("WAWebChatGetters") as Record<
            string,
            (chatModel: unknown) => unknown
          >;
          const chatGetterResults: Record<string, unknown> = {};
          for (const [key, getter] of Object.entries(chatGetters)) {
            if (typeof getter !== "function" || !/name|title|formatted/i.test(key)) {
              continue;
            }
            try {
              chatGetterResults[key] = getter(chat);
            } catch {
              // Getter may require additional state.
            }
          }
          attempts.push(`chatGetters:${JSON.stringify(chatGetterResults).slice(0, 500)}`);
        } catch (error) {
          attempts.push(`chatGetters.fail:${String(error)}`);
        }

        try {
          const frontendContactGetters = win.require(
            "WAWebFrontendContactGetters",
          ) as Record<string, (contact: unknown) => unknown>;
          const collections = win.require("WAWebCollections") as {
            Contact: { find: (value: unknown) => Promise<unknown> };
          };
          const contact = await collections.Contact.find(lidWid);
          const contactGetterResults: Record<string, unknown> = {};
          for (const [key, getter] of Object.entries(frontendContactGetters)) {
            if (typeof getter !== "function") {
              continue;
            }
            try {
              contactGetterResults[key] = getter(contact);
            } catch {
              // Getter may require additional state.
            }
          }
          attempts.push(
            `frontendContactGetters:${JSON.stringify(contactGetterResults).slice(0, 800)}`,
          );
        } catch (error) {
          attempts.push(`frontendContactGetters.fail:${String(error)}`);
        }
      }

      try {
        const req = win.require as unknown as {
          m?: Record<string, unknown>;
          c?: Record<string, unknown>;
        };
        const moduleNames = Object.keys(req.m || req.c || {}).filter((name) =>
          /pushname|notifyname|contactinfo|contact\.info|fetchcontact|profiledata/i.test(
            name,
          ),
        );
        attempts.push(`webpack.modules:${moduleNames.slice(0, 25).join(",")}`);
        for (const moduleName of moduleNames.slice(0, 8)) {
          const mod = tryRequire(moduleName);
          if (!mod) {
            continue;
          }
          const fnNames = Object.keys(mod).filter((key) => typeof mod[key] === "function");
          for (const fnName of fnNames.slice(0, 2)) {
            try {
              const fn = mod[fnName] as (...args: unknown[]) => unknown;
              const result = await fn(lidWid, phoneWid, chat);
              attempts.push(
                `webpack.${moduleName}.${fnName}:${JSON.stringify(result).slice(0, 250)}`,
              );
            } catch {
              // Try the next export.
            }
          }
        }
      } catch (error) {
        attempts.push(`webpack.fail:${String(error)}`);
      }

      const contactAfterProbe = await readContactNames(lidWid);
      const sWhatsappId = `${digits}@s.whatsapp.net`;
      try {
        const sWhatsappNames = await readContactNames(
          widFactory.createWid(sWhatsappId),
        );
        attempts.push(`sWhatsappNames:${JSON.stringify(sWhatsappNames)}`);
        if (
          !contactAfterProbe.pushname &&
          (sWhatsappNames.pushname || sWhatsappNames.name)
        ) {
          return {
            attempts,
            contactAfterProbe: sWhatsappNames,
          };
        }
      } catch (error) {
        attempts.push(`sWhatsapp.fail:${String(error)}`);
      }

      return { attempts, contactAfterProbe };
    },
    { digits: phoneDigits, resolved: resolvedId },
  );
}

async function openContactInfoInUi(
  page: Page,
): Promise<{ domName: string | null; steps: string[] }> {
  const steps: string[] = [];
  const headerSelectors = [
    'header [data-testid="conversation-info-header"]',
    'header[data-testid="conversation-header"]',
    "#main header",
  ];

  for (const selector of headerSelectors) {
    try {
      const element = await page.$(selector);
      if (!element) {
        continue;
      }
      await element.click({ delay: 40 });
      steps.push(`click:${selector}`);
      break;
    } catch {
      // Try the next selector.
    }
  }

  try {
    await page.waitForSelector('[data-testid="drawer-right"]', {
      timeout: 4_000,
    });
    steps.push("drawer-right.visible");
  } catch {
    steps.push("drawer-right.missing");
  }

  const domName = await page.evaluate(() => {
    const reject = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || trimmed.length < 2) {
        return true;
      }
      if (/^\+?[\d\s()-]{8,}$/.test(trimmed)) {
        return true;
      }
      const lower = trimmed.toLowerCase();
      if (
        lower.includes("last seen") ||
        lower.includes("online") ||
        lower.includes("click here") ||
        lower.includes("whatsapp") ||
        lower.includes("media") ||
        lower.includes("mute") ||
        lower.includes("search")
      ) {
        return true;
      }
      return false;
    };

    const drawer =
      document.querySelector('[data-testid="drawer-right"]') ||
      document.querySelector('[data-testid="contact-info"]');
    if (!drawer) {
      return null;
    }

    const drawerText = drawer.textContent?.replace(/\s+/g, " ").trim() || "";
    (window as unknown as { __waDrawerText?: string }).__waDrawerText =
      drawerText.slice(0, 800);

    const selectors = [
      '[data-testid="contact-info-name"]',
      'span[dir="auto"]',
      'div[dir="auto"]',
    ];

    for (const selector of selectors) {
      for (const node of Array.from(drawer.querySelectorAll(selector))) {
        const text = node.textContent?.trim();
        if (text) {
          const sanitized = text.replace(/^~+/, "").trim();
          if (
            sanitized.length >= 3 &&
            !reject(sanitized) &&
            /^[A-Za-z\u0080-\uFFFF]/.test(sanitized)
          ) {
            return sanitized;
          }
        }
      }
    }

    return null;
  });

  const drawerText = await page.evaluate(() => {
    const win = window as unknown as { __waDrawerText?: string };
    return win.__waDrawerText || null;
  });
  if (drawerText) {
    steps.push(`drawerText:${drawerText}`);
  }

  if (domName) {
    steps.push(`dom:${domName}`);
  }

  return { domName, steps };
}

async function openContactInfoViaClient(
  page: Page,
  chatId: string,
): Promise<string[]> {
  const steps: string[] = [];
  try {
    await page.evaluate(async (id) => {
      const chat = await window.WWebJS.getChat(id, { getAsModel: false });
      await window.require("WAWebCmd").Cmd.openChatBottom({ chat });
    }, chatId);
    steps.push("evaluate.openChatWindow.ok");
  } catch (error) {
    steps.push(`evaluate.openChatWindow.fail:${String(error).slice(0, 120)}`);
  }

  try {
    await page.evaluate(async (id) => {
      const chat = await window.WWebJS.getChat(id, { getAsModel: false });
      await window.require("WAWebCmd").Cmd.openDrawerMid(chat);
    }, chatId);
    steps.push("evaluate.openChatDrawer.ok");
  } catch (error) {
    steps.push(`evaluate.openChatDrawer.fail:${String(error).slice(0, 120)}`);
  }

  return steps;
}

/**
 * Opens/triggers the same contact-profile flows WhatsApp Web uses and captures
 * network + in-page contact updates to recover pushnames for personal accounts.
 */
export async function probePushnameViaProfileView(
  page: Page,
  phoneDigits: string,
  resolvedId: string | null,
): Promise<ProfileProbeResult> {
  await installNetworkCaptureHooks(page);

  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  const cdpCaptures: NetworkCapture[] = [];
  const requestUrls = new Map<string, string>();

  const onRequestWillBeSent = (event: {
    requestId: string;
    request?: { url?: string };
  }) => {
    if (event.request?.url) {
      requestUrls.set(event.requestId, event.request.url);
    }
  };

  const onLoadingFinished = async (event: { requestId: string }) => {
    const url = requestUrls.get(event.requestId) || `cdp:${event.requestId}`;
    const lowerUrl = url.toLowerCase();
    const interestingUrl =
      lowerUrl.includes("whatsapp") ||
      lowerUrl.includes("facebook") ||
      lowerUrl.includes("usync") ||
      lowerUrl.includes("query") ||
      lowerUrl.includes("mex") ||
      lowerUrl.includes("contact");

    if (!interestingUrl) {
      return;
    }

    try {
      const body = (await cdp.send("Network.getResponseBody", {
        requestId: event.requestId,
      })) as { body: string; base64Encoded: boolean };
      const text = body.base64Encoded
        ? Buffer.from(body.body, "base64").toString("utf8")
        : body.body;
      cdpCaptures.push({
        url,
        snippet: text.slice(0, 16_000),
      });
    } catch {
      // Some responses have no body.
    }
  };

  cdp.on("Network.requestWillBeSent", onRequestWillBeSent);
  cdp.on("Network.loadingFinished", onLoadingFinished);

  try {
    const trigger = await triggerProfileProbe(page, phoneDigits, resolvedId);
    const chatId = resolvedId || `${phoneDigits}@c.us`;
    trigger.attempts.push(...(await openContactInfoViaClient(page, chatId)));
    const ui = await openContactInfoInUi(page);
    trigger.attempts.push(...ui.steps);

    await new Promise((resolve) => {
      setTimeout(resolve, PROFILE_PROBE_WAIT_MS);
    });

    const postUiContact = await page.evaluate(
      async ({ resolved }: { resolved: string | null }) => {
        const win = window as unknown as {
          require: (name: string) => Record<string, unknown>;
        };
        if (!resolved) {
          return null;
        }
        const collections = win.require("WAWebCollections") as {
          Contact: { find: (value: unknown) => Promise<unknown> };
        };
        const widFactory = win.require("WAWebWidFactory") as {
          createWid: (value: string) => unknown;
        };
        const getters = win.require("WAWebContactGetters") as {
          getPushname: (contact: unknown) => string;
          getVerifiedName: (contact: unknown) => string;
          getName: (contact: unknown) => string;
        };
        const contact = await collections.Contact.find(
          widFactory.createWid(resolved),
        );
        return {
          pushname: getters.getPushname(contact) || null,
          verifiedName: getters.getVerifiedName(contact) || null,
          name: getters.getName(contact) || null,
        };
      },
      { resolved: resolvedId },
    );

    if (postUiContact) {
      trigger.contactAfterProbe = postUiContact;
    }

    const inPageCaptures = await readInPageCaptures(page);
    const captures = [...inPageCaptures, ...cdpCaptures];

    const hints = captures.flatMap((capture) =>
      collectNameHints(capture.snippet),
    );
    const hintedName = pickBestNameHint(hints);

    const pushname =
      normalizeProbeName(trigger.contactAfterProbe.pushname) ||
      normalizeProbeName(hintedName);
    const verifiedName =
      normalizeProbeName(trigger.contactAfterProbe.verifiedName) || null;
    const name = normalizeProbeName(trigger.contactAfterProbe.name) || null;

    return {
      pushname,
      verifiedName,
      name,
      domName: normalizeProbeName(ui.domName),
      attempts: trigger.attempts,
      captures: captures.slice(0, 30),
      contactAfterProbe: trigger.contactAfterProbe,
    };
  } finally {
    cdp.off("Network.requestWillBeSent", onRequestWillBeSent);
    cdp.off("Network.loadingFinished", onLoadingFinished);
    await cdp.detach().catch(() => undefined);
  }
}
