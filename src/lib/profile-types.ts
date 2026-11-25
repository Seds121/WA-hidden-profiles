export type ProfileLookupResult = {
  phone: string;
  success: boolean;
  fromCache?: boolean;
  /** Reused from a prior fetch run in the database (no WhatsApp call). */
  reusedFromDb?: boolean;
  /** Relative path under data/fetches/ when reusing a stored image file. */
  storedImagePath?: string | null;
  hasProfilePic?: boolean;
  profilePicUrl?: string | null;
  error?: string;
  message?: string;
  resolvedPhone?: string;
  whatsappId?: string | null;
  existsOnWhatsApp?: boolean;
  name?: string | null;
  pushname?: string | null;
  shortName?: string | null;
  verifiedName?: string | null;
  displayName?: string | null;
  about?: string | null;
  isBusiness?: boolean;
  isEnterprise?: boolean;
  isWAContact?: boolean;
  isMyContact?: boolean;
  accountType?: string;
  businessDescription?: string | null;
  businessCategories?: string[];
  businessEmail?: string | null;
  businessWebsite?: string[];
  businessAddress?: string | null;
  businessTag?: string | null;
  accountId?: string;
  /** Set after a lookup that knows how to read personal pushnames. */
  nameLookupVersion?: number;
};
