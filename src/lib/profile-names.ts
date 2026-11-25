const PERSON_NAME_BLOCKLIST = new Set(
  [
    "an",
    "off",
    "add",
    "end",
    "the",
    "and",
    "for",
    "you",
    "all",
    "new",
    "my zong",
    "zong",
    "unknown user",
    "whatsapp",
    "search",
    "voice",
    "video",
    "media",
    "block",
    "mute",
    "star",
    "delete",
    "export",
    "report",
    "clear",
    "favorite",
    "favourite",
    "encryption",
    "privacy",
    "advanced",
    "disappearing",
    "messages",
    "links",
    "docs",
    "starred",
    "notifications",
  ].map((value) => value.toLowerCase()),
);

function isLikelyPhoneOrId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (/^\+?[\d\s().-]{8,}$/.test(trimmed)) {
    return true;
  }
  if (/@(c\.us|lid|s\.whatsapp\.net)$/i.test(trimmed)) {
    return true;
  }
  if (/^\d{6,}$/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * WhatsApp chat list prefixes a personal pushname with "~" when the number
 * is not saved in the phone address book. Business verified names are shown
 * without that prefix. The tilde is display chrome, not part of the name.
 */
export function stripWhatsAppPushnamePrefix(value: string): string {
  return value.replace(/^\s*~+\s*/, "").trim();
}

/**
 * Returns a cleaned person name or null when the value is too short, numeric,
 * or looks like UI chrome rather than a real contact name.
 */
export function sanitizePersonName(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) {
    return null;
  }

  const normalized = stripWhatsAppPushnamePrefix(value);
  if (!normalized || normalized.length < 2 || normalized.length > 80) {
    return null;
  }
  if (isLikelyPhoneOrId(normalized)) {
    return null;
  }
  if (!/[a-zA-Z\u0080-\uFFFF]/.test(normalized)) {
    return null;
  }
  if (PERSON_NAME_BLOCKLIST.has(normalized.toLowerCase())) {
    return null;
  }

  return normalized;
}
