import { NextRequest, NextResponse } from "next/server";
import { createApiKey, listApiKeys } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keys = await listApiKeys();
    return NextResponse.json({ success: true, keys });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list API keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => ({}));
    const name =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { name?: unknown }).name === "string"
        ? (body as { name: string }).name
        : "Ocean";

    const created = await createApiKey(name);
    return NextResponse.json({ success: true, key: created }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
