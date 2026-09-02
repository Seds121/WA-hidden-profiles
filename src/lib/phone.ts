/**
 * Convert typed phone input into international digits (no + or @c.us).
 *
 * Examples:
 *   03110365141  → 923110365141  (Pakistan local)
 *   923110365141 → 923110365141
 *   9876543210   → 919876543210  (India 10-digit mobile)
 */
export function toInternationalDigits(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length < 10 || cleaned.length > 15) {
    return null;
  }

  // Pakistan local: 03XX-XXXXXXX (11 digits, leading trunk 0)
  if (/^03\d{9}$/.test(cleaned)) {
    return `92${cleaned.slice(1)}`;
  }

  // India local: 0 + 10-digit mobile (6-9)
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return `91${cleaned.slice(1)}`;
  }

  if (/^92\d{10}$/.test(cleaned) || /^91\d{10}$/.test(cleaned) || /^1\d{10}$/.test(cleaned)) {
    return cleaned;
  }

  // 10-digit local without trunk prefix
  if (cleaned.length === 10) {
    if (cleaned.startsWith("3")) {
      return `92${cleaned}`;
    }
    if (/^[6-9]/.test(cleaned)) {
      return `91${cleaned}`;
    }
  }

  if (cleaned.startsWith("0") && cleaned.length >= 11) {
    return cleaned.slice(1);
  }

  const defaultCode = (process.env.WWJS_DEFAULT_COUNTRY_CODE || "92").replace(
    /\D/g,
    "",
  );
  if (cleaned.length === 10 && defaultCode) {
    return `${defaultCode}${cleaned}`;
  }

  return cleaned;
}

export function toWhatsAppJid(phone: string): string | null {
  const digits = toInternationalDigits(phone);
  return digits ? `${digits}@c.us` : null;
}
