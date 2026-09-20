import type { NextRequest } from "next/server";
import type { ProfileLookupResult } from "@/lib/profile-types";

export function getPublicBaseUrl(request?: NextRequest): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv;
  }

  if (request) {
    const proto =
      request.headers.get("x-forwarded-proto") ||
      request.nextUrl.protocol.replace(":", "") ||
      "http";
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      request.nextUrl.host;
    if (host) {
      return `${proto}://${host}`;
    }
  }

  return "";
}

export function absolutizeProfile(
  profile: ProfileLookupResult,
  baseUrl: string,
): ProfileLookupResult {
  const url = profile.profilePicUrl;
  if (!baseUrl || !url || url.startsWith("http://") || url.startsWith("https://")) {
    return profile;
  }

  const path = url.startsWith("/") ? url : `/${url}`;
  return {
    ...profile,
    profilePicUrl: `${baseUrl}${path}`,
  };
}
