export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.length > 0) {
      return record.message;
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") {
        return json;
      }
    } catch {
      // ignore
    }
  }
  return "Unknown error";
}

export function isUselessErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length <= 2;
}

export function toUserFacingError(error: unknown, fallback: string): string {
  const message = getErrorMessage(error);
  if (isUselessErrorMessage(message) || isLidError(error)) {
    return fallback;
  }
  return message;
}

export function isPrivacyError(error: unknown): boolean {
  return getErrorMessage(error).toLowerCase().includes("privacy");
}

export function isLidError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("no lid") || message.includes("lid is missing");
}
