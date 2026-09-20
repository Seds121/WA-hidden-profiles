import { Badge } from './ui/badge';

export interface ProfileResult {
  phone: string;
  success: boolean;
  hasProfilePic?: boolean;
  profilePicUrl?: string | null;
  error?: string;
  message?: string;
  fromCache?: boolean;
  reusedFromDb?: boolean;
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
}

function accountTypeTone(accountType?: string) {
  switch (accountType) {
    case 'Business':
      return 'primary' as const;
    case 'Enterprise':
      return 'info' as const;
    default:
      return 'neutral' as const;
  }
}

function ProfileAvatar({
  phone,
  profilePicUrl,
  size = 'md',
}: {
  phone: string;
  profilePicUrl: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-10 w-10' : 'h-16 w-16';

  return (
    <a
      href={profilePicUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group shrink-0 focus-ring rounded-[var(--radius-full)]"
      title="Open full-size image"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={profilePicUrl}
        alt={`Profile for ${phone}`}
        className={`${sizeClass} rounded-[var(--radius-full)] border-2 border-border object-cover shadow-[var(--shadow-sm)] transition group-hover:border-primary group-hover:shadow-[var(--shadow-md)]`}
        onError={(event) => {
          event.currentTarget.src = '/fallback-avatar.svg';
        }}
      />
      <span className="mt-2 block text-center text-xs font-medium text-primary">
        View image
      </span>
    </a>
  );
}

function formatWebsites(websites?: string[]): string | null {
  if (!websites || websites.length === 0) {
    return null;
  }
  const normalized = websites
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        if (typeof record.url === 'string') {
          return record.url.trim();
        }
      }
      return '';
    })
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized.join(', ') : null;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </dt>
      <dd className="text-sm text-foreground wrap-break-word">{value}</dd>
    </div>
  );
}

export function ProfileDetailsCard({ result }: { result: ProfileResult }) {
  const accountType = result.accountType || 'Personal';
  const showBusinessDescription =
    Boolean(result.businessDescription) &&
    result.businessDescription !== result.about;

  return (
    <article className="rounded-[var(--radius-lg)] border border-border bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {result.hasProfilePic && result.profilePicUrl ? (
          <ProfileAvatar
            phone={result.phone}
            profilePicUrl={result.profilePicUrl}
            size="lg"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--radius-full)] border-2 border-dashed border-border bg-surface text-xs text-foreground-muted">
            No photo
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-4">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                {result.displayName || result.phone}
              </h3>
              <Badge tone={accountTypeTone(accountType)}>{accountType}</Badge>
              {result.verifiedName && <Badge tone="info">Verified</Badge>}
              {result.fromCache && (
                <Badge tone="neutral">Cached</Badge>
              )}
            </div>
            {result.displayName && result.displayName !== result.phone && (
              <p className="mt-1 text-sm text-foreground-muted">
                Input: {result.phone}
              </p>
            )}
          </header>

          <dl className="grid gap-3">
            <DetailRow label="Push name" value={result.pushname} />
            <DetailRow label="Business name" value={result.businessTag} />
            <DetailRow label="Saved name" value={result.name} />
            <DetailRow label="Verified name" value={result.verifiedName} />
            <DetailRow label="About" value={result.about} />
            {showBusinessDescription && (
              <DetailRow
                label="Business description"
                value={result.businessDescription}
              />
            )}
            <DetailRow
              label="Categories"
              value={
                result.businessCategories && result.businessCategories.length > 0
                  ? result.businessCategories.join(', ')
                  : null
              }
            />
            <DetailRow label="Email" value={result.businessEmail} />
            <DetailRow
              label="Website"
              value={formatWebsites(result.businessWebsite)}
            />
            <DetailRow label="Address" value={result.businessAddress} />
            <DetailRow label="Resolved as" value={result.resolvedPhone} />
            <DetailRow label="WhatsApp ID" value={result.whatsappId} />
          </dl>

          <footer className="flex flex-wrap gap-2">
            {result.existsOnWhatsApp === false && (
              <Badge tone="warning">Not on WhatsApp</Badge>
            )}
            {result.isMyContact && (
              <Badge tone="info">In your contacts</Badge>
            )}
            {result.isBusiness && (
              <Badge tone="primary">Business account</Badge>
            )}
            {result.isEnterprise && (
              <Badge tone="info">Enterprise account</Badge>
            )}
            {result.success && !result.hasProfilePic && (
              <Badge tone="warning">
                {result.message || 'No profile picture'}
              </Badge>
            )}
          </footer>
        </div>
      </div>
    </article>
  );
}
