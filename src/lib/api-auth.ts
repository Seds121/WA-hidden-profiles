import { NextRequest } from "next/server";
import { jsonWithCors } from "@/lib/api-cors";
import { type ApiKeyRecord, verifyApiKey } from "@/lib/api-keys";

function extractApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey?.trim()) {
    return headerKey.trim();
  }

  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token || null;
  }

  return null;
}

export async function requireApiKey(
  request: NextRequest,
): Promise<
  | { ok: true; key: ApiKeyRecord }
  | { ok: false; response: ReturnType<typeof jsonWithCors> }
> {
  const plaintext = extractApiKey(request);
  if (!plaintext) {
    return {
      ok: false,
      response: jsonWithCors(
        request,
        {
          error:
            "Missing API key. Send X-API-Key: whp_... or Authorization: Bearer whp_...",
        },
        { status: 401 },
      ),
    };
  }

  const key = await verifyApiKey(plaintext);
  if (!key) {
    return {
      ok: false,
      response: jsonWithCors(
        request,
        { error: "Invalid or revoked API key" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, key };
}
