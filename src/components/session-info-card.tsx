'use client';

import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { InfoIcon, UsersIcon } from './ui/icons';

type SessionInfoCardProps = {
  connected: boolean;
};

export function SessionInfoCard({ connected }: SessionInfoCardProps) {
  return (
    <Card
      accent="violet"
      title="Shared WhatsApp session"
      description="One linked account powers every visitor to this URL."
      icon={<UsersIcon className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={connected ? 'primary' : 'warning'}>
            {connected ? 'Session active' : 'No session'}
          </Badge>
          <Badge tone="neutral">Single account only</Badge>
        </div>

        <ul className="space-y-2 text-sm text-foreground-muted">
          <li className="flex gap-2">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              When you scan the QR code, <strong className="text-foreground">your</strong>{' '}
              WhatsApp is linked to the server — not each visitor&apos;s phone.
            </span>
          </li>
          <li className="flex gap-2">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Anyone who opens this site uses the same connection and can run lookups
              through your linked account.
            </span>
          </li>
          <li className="flex gap-2">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              For client-only access, put the app behind a VPN, firewall, or password —
              do not share the public URL unless you trust every viewer.
            </span>
          </li>
        </ul>
      </div>
    </Card>
  );
}
