import { NextRequest } from "next/server";
import { jsonWithCors, optionsResponse } from "@/lib/api-cors";
import { getOpenApiSpec } from "@/lib/openapi";
import { getPublicBaseUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  return jsonWithCors(request, getOpenApiSpec(getPublicBaseUrl(request)));
}
