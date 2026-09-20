import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { resolveStoredImagePath } from "@/lib/data-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { path } = await context.params;
    const relativePath = path.join("/");
    const absolutePath = resolveStoredImagePath(relativePath);

    if (!absolutePath) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(absolutePath);
    const ext = absolutePath.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
