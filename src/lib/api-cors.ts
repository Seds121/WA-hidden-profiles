import { NextRequest, NextResponse } from "next/server";

function allowedOrigins(): string[] {
  const raw = process.env.OCEAN_CORS_ORIGINS?.trim();
  if (!raw) {
    return ["*"];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function corsHeaders(request: NextRequest): Headers {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigins();
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-API-Key",
  );
  headers.set("Access-Control-Max-Age", "86400");

  if (allowed.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
    return headers;
  }

  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  return headers;
}

export function jsonWithCors(
  request: NextRequest,
  body: unknown,
  init?: { status?: number },
): NextResponse {
  const response = NextResponse.json(body, init);
  corsHeaders(request).forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

export function optionsResponse(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
