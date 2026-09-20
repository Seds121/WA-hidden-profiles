import "server-only";

import { getStoredProfile } from "@/lib/profile-store";
import type { ProfileLookupResult } from "@/lib/profile-types";

/** Latest successful lookup from SQLite (no WhatsApp call). */
export async function getStoredProfileLookup(
  rawPhone: string,
  digits: string,
): Promise<ProfileLookupResult | null> {
  const record = await getStoredProfile(digits);
  if (!record || !record.success) {
    const byInput = await getStoredProfile(rawPhone.replace(/\D/g, ""));
    if (!byInput || !byInput.success) {
      return null;
    }
    return {
      ...byInput.profile,
      phone: rawPhone,
      reusedFromDb: true,
      fromCache: true,
    };
  }

  return {
    ...record.profile,
    phone: rawPhone,
    reusedFromDb: true,
    fromCache: true,
  };
}
