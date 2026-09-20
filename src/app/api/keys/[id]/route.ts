import { NextRequest, NextResponse } from "next/server";
import { renameApiKey, revokeApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    const name =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { name?: unknown }).name === "string"
        ? (body as { name: string }).name
        : "";

    const ok = await renameApiKey(id, name);
    if (!ok) {
      return NextResponse.json(
        { error: "Could not rename key (missing name or key not found)" },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to rename API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const ok = await revokeApiKey(id);
    if (!ok) {
      return NextResponse.json(
        { error: "Key not found or already revoked" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to revoke API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
