import { API_JOB_MAX_PHONES } from "@/lib/api-jobs";
import { QUEUE_INGEST_MAX } from "@/lib/queue-constants";
import { STORED_PROFILES_PAGE_SIZE } from "@/lib/profile-constants";

const whatsappAccountSchema = {
  type: "object",
  properties: {
    accountId: { type: "string", example: "1" },
    ready: { type: "boolean" },
    authenticated: { type: "boolean" },
    connectedPhone: { type: ["string", "null"], example: "923001234567" },
    loadingPercent: { type: ["number", "null"] },
    qrCode: {
      type: ["string", "null"],
      description: "Raw WhatsApp pairing string. Null when connected.",
    },
    qrCodeDataUrl: {
      type: ["string", "null"],
      description:
        "PNG data URL for the barcode. Render in an <img src> in the OSINT app.",
    },
    initialized: { type: "boolean" },
    lastError: { type: ["string", "null"] },
    requiresQrScan: { type: "boolean" },
    startupPhase: {
      type: "string",
      enum: ["idle", "starting", "waiting-qr", "ready", "error"],
    },
    status: {
      type: "string",
      enum: ["connected", "scan_qr", "connecting", "not_connected"],
    },
    message: { type: "string" },
  },
};

const profileSchema = {
  type: "object",
  properties: {
    phone: { type: "string" },
    success: { type: "boolean" },
    fromCache: { type: "boolean" },
    reusedFromDb: { type: "boolean" },
    hasProfilePic: { type: "boolean" },
    profilePicUrl: { type: ["string", "null"] },
    error: { type: "string" },
    message: { type: "string" },
    resolvedPhone: { type: "string" },
    whatsappId: { type: ["string", "null"] },
    existsOnWhatsApp: { type: "boolean" },
    name: { type: ["string", "null"] },
    pushname: { type: ["string", "null"] },
    shortName: { type: ["string", "null"] },
    verifiedName: { type: ["string", "null"] },
    displayName: { type: ["string", "null"] },
    about: { type: ["string", "null"] },
    isBusiness: { type: "boolean" },
    isEnterprise: { type: "boolean" },
    isWAContact: { type: "boolean" },
    isMyContact: { type: "boolean" },
    accountType: { type: "string" },
    businessDescription: { type: ["string", "null"] },
    businessCategories: { type: "array", items: { type: "string" } },
    businessEmail: { type: ["string", "null"] },
    businessWebsite: { type: "array", items: { type: "string" } },
    businessAddress: { type: ["string", "null"] },
    businessTag: { type: ["string", "null"] },
  },
};

export function getOpenApiSpec(baseUrl: string) {
  const servers = baseUrl
    ? [{ url: `${baseUrl.replace(/\/$/, "")}/api/v1` }]
    : [{ url: "/api/v1" }];

  return {
    openapi: "3.0.3",
    info: {
      title: "WhatsApp Hidden Profiles API",
      version: "1.1.0",
      description:
        "Ocean-facing API for linking WhatsApp sessions (QR barcode, multiple accounts) and looking up profiles by phone number. Authenticate with an API key generated in this app (Settings). OSINT should GET /status after saving the key: HTTP 200 means the API connection is OK; whatsappAdded:false means no session is linked yet — show accounts[].qrCodeDataUrl and poll until ready.",
    },
    servers,
    security: [{ apiKey: [] }, { bearer: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Key from Settings, format whp_...",
        },
        bearer: {
          type: "http",
          scheme: "bearer",
          description: "Same key as Authorization: Bearer whp_...",
        },
      },
      schemas: {
        WhatsAppAccount: whatsappAccountSchema,
        Profile: profileSchema,
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
        },
      },
    },
    paths: {
      "/status": {
        get: {
          summary: "API + WhatsApp connection status",
          description:
            "HTTP 200 with a valid key means the WhatsApp Hidden Profiles API is reachable. If whatsappAdded is false, no phone is linked — render the first account's qrCodeDataUrl and poll this endpoint (or GET /accounts/{id}) until ready is true.",
          responses: {
            "200": {
              description:
                "ready / whatsappAdded, per-account QR barcodes, and queue worker status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      ready: { type: "boolean" },
                      whatsappAdded: {
                        type: "boolean",
                        description: "True when at least one WhatsApp session is linked",
                      },
                      readyCount: { type: "integer" },
                      accountCount: { type: "integer" },
                      maxAccounts: { type: "integer" },
                      accounts: {
                        type: "array",
                        items: { $ref: "#/components/schemas/WhatsAppAccount" },
                      },
                      worker: { type: "object" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": { description: "Missing or invalid API key" },
          },
        },
      },
      "/accounts": {
        get: {
          summary: "List linked WhatsApp accounts",
          description:
            "Same account objects as GET /status (including QR when a scan is needed). Use this from OSINT settings to show connection cards.",
          responses: {
            "200": {
              description: "Account list with QR barcodes when not connected",
            },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Add another WhatsApp account slot",
          description:
            "Creates a new session slot (same as + Add account in the dashboard). Poll GET /accounts/{id} until qrCodeDataUrl appears, then scan with WhatsApp → Linked devices.",
          responses: {
            "201": {
              description: "Account created. Scan qrCodeDataUrl to connect.",
            },
            "400": { description: "Maximum accounts reached" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/accounts/{id}": {
        get: {
          summary: "Get one WhatsApp account (poll for QR / ready)",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", example: "1" },
            },
          ],
          responses: {
            "200": {
              description: "Account status, QR barcode, and message",
            },
            "404": { description: "Account not registered" },
          },
        },
        delete: {
          summary: "Delete a WhatsApp account slot",
          description:
            "Logs the session out and removes the slot. The last remaining slot cannot be deleted.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Deleted" },
            "400": { description: "Cannot delete the last account" },
            "404": { description: "Account not registered" },
          },
        },
      },
      "/accounts/{id}/disconnect": {
        post: {
          summary: "Logout / reset a WhatsApp account",
          description:
            "Clears the saved session and starts a new QR. Keep the slot; scan again to reconnect.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Disconnected; new QR when ready" },
            "404": { description: "Account not registered" },
          },
        },
      },
      "/queue": {
        get: {
          summary: "Queue counts and background worker status",
          responses: {
            "200": {
              description:
                "pending/done/failed counts plus worker phase (fetching, resting 20 min, waiting for WhatsApp)",
            },
          },
        },
        post: {
          summary: "Enqueue phone numbers for the always-on worker",
          description:
            "Stores numbers in SQLite. Duplicates and numbers already profiled are skipped. The worker fetches 50 per linked WhatsApp account, then rests 20 minutes. Send at most 20,000 numbers per request; loop for a million.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["phones"],
                  properties: {
                    phones: {
                      type: "array",
                      maxItems: QUEUE_INGEST_MAX,
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Accepted / skipped counts" },
            "400": { description: "Too many numbers or invalid body" },
          },
        },
      },
      "/lookup": {
        post: {
          summary: "Look up a single phone number (synchronous)",
          description:
            "Returns SQLite data immediately if this number was fetched before (no WhatsApp call). Otherwise fetches live.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["phone"],
                  properties: {
                    phone: {
                      type: "string",
                      example: "03171717883",
                    },
                    refresh: {
                      type: "boolean",
                      description: "Skip cache and fetch from WhatsApp",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Profile result" },
            "400": { description: "Invalid phone" },
            "401": { description: "Unauthorized" },
            "503": { description: "No WhatsApp account connected" },
          },
        },
      },
      "/lookups": {
        post: {
          summary: "Start an async job for a list of numbers",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["phones"],
                  properties: {
                    phones: {
                      type: "array",
                      maxItems: API_JOB_MAX_PHONES,
                      items: { type: "string" },
                      example: ["+923171717883", "03331234567"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "202": { description: "Job queued" },
            "400": { description: "Invalid phones list" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/lookups/{id}": {
        get: {
          summary: "Poll an async lookup job",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Job status and results so far" },
            "404": { description: "Job not found" },
          },
        },
      },
      "/profiles": {
        get: {
          summary: "Search stored profiles",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          ],
          responses: {
            "200": {
              description: `Paginated list (${STORED_PROFILES_PAGE_SIZE} per page)`,
            },
          },
        },
      },
      "/profiles/{digits}": {
        get: {
          summary: "Get one stored profile by international digits",
          parameters: [
            {
              name: "digits",
              in: "path",
              required: true,
              schema: { type: "string", example: "923171717883" },
            },
          ],
          responses: {
            "200": { description: "Stored profile" },
            "404": { description: "Not found" },
          },
        },
      },
    },
  };
}
