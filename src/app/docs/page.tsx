'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppNav } from '@/components/app-nav';
import { useToast } from '@/components/toast-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

function CodeBlock({
  title,
  code,
  onCopy,
}: {
  title: string;
  code: string;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onCopy(code)}
        >
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  const { toast } = useToast();
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const base = origin || 'http://YOUR_VPS:3002';
  const api = `${base}/api/v1`;

  const copy = (value: string) => {
    void navigator.clipboard.writeText(value);
    toast('success', 'Copied');
  };

  const curlStatus = `curl -s "${api}/status" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlAccounts = `curl -s "${api}/accounts" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlAddAccount = `curl -s -X POST "${api}/accounts" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlOneAccount = `curl -s "${api}/accounts/1" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlDisconnect = `curl -s -X POST "${api}/accounts/1/disconnect" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlDeleteAccount = `curl -s -X DELETE "${api}/accounts/2" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlLookup = `curl -s -X POST "${api}/lookup" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: whp_YOUR_KEY" \\
  -d '{"phone":"03171717883"}'`;

  const curlBatch = `curl -s -X POST "${api}/lookups" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: whp_YOUR_KEY" \\
  -d '{"phones":["+923171717883","03331234567"]}'`;

  const curlPoll = `curl -s "${api}/lookups/JOB_ID" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlQueue = `curl -s -X POST "${api}/queue" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: whp_YOUR_KEY" \\
  -d '{"phones":["+923171717883","03331234567"]}'`;

  const curlQueueStatus = `curl -s "${api}/queue" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlProfiles = `curl -s "${api}/profiles?q=0317&page=1" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const curlOneProfile = `curl -s "${api}/profiles/923171717883" \\
  -H "X-API-Key: whp_YOUR_KEY"`;

  const oceanConnect = `const API = "${api}";
const KEY = process.env.WA_HIDDEN_PROFILES_API_KEY; // whp_...

function headers(json = false) {
  return {
    "X-API-Key": KEY,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

/** After saving the key in OSINT settings: HTTP 200 = API connected. */
async function checkWhatsAppApi() {
  const res = await fetch(\`\${API}/status\`, { headers: headers() });
  if (res.status === 401) throw new Error("Invalid WhatsApp API key");
  if (!res.ok) throw new Error(\`WhatsApp API error \${res.status}\`);
  return res.json();
}

/** Poll until a QR PNG is ready, or until a session is linked. */
async function waitForQrOrReady(accountId = "1", { timeoutMs = 120000 } = {}) {
  const started = Date.now();
  for (;;) {
    const res = await fetch(\`\${API}/accounts/\${accountId}\`, {
      headers: headers(),
    });
    const data = await res.json();
    if (data.ready) return data;
    if (data.qrCodeDataUrl) return data;
    if (Date.now() - started > timeoutMs) {
      throw new Error(data.message || "Timed out waiting for QR");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Add another WhatsApp (same as + Add account in this dashboard). */
async function addWhatsAppAccount() {
  const res = await fetch(\`\${API}/accounts\`, {
    method: "POST",
    headers: headers(),
  });
  return res.json();
}`;

  const oceanFetch = `const API = "${api}";
const KEY = process.env.WA_HIDDEN_PROFILES_API_KEY; // whp_...

function headers(json = false) {
  return {
    "X-API-Key": KEY,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

/** Already stored? 404 = never fetched. No WhatsApp call. */
async function getStoredProfile(digits) {
  const res = await fetch(\`\${API}/profiles/\${digits}\`, {
    headers: headers(),
  });
  if (res.status === 404) return null;
  return res.json();
}

async function searchProfiles(q = "", page = 1) {
  const url = new URL(\`\${API}/profiles\`);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  const res = await fetch(url, { headers: headers() });
  return res.json();
}

/** Live lookup. Returns SQLite cache when already fetched. */
async function lookupOne(phone, refresh = false) {
  const res = await fetch(\`\${API}/lookup\`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ phone, refresh }),
  });
  return res.json();
}

/** OSINT: stored first, live fetch only if missing. */
async function fetchProfileForOsint(phone, digits) {
  const stored = digits ? await getStoredProfile(digits) : null;
  if (stored?.profile) return stored;
  return lookupOne(phone);
}

async function lookupMany(phones) {
  const start = await fetch(\`\${API}/lookups\`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ phones }),
  });
  const { jobId } = await start.json();

  for (;;) {
    const poll = await fetch(\`\${API}/lookups/\${jobId}\`, {
      headers: headers(),
    });
    const job = await poll.json();
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
}`;

  return (
    <>
      <div className="app-shell-header border-b border-white/10 px-4 py-8 text-white md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              API documentation
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Call this service from an OSINT app the same way you call RapidAPI
              providers. Paste a key from{' '}
              <Link href="/settings" className="underline hover:text-white">
                Settings
              </Link>
              . After the key connects, GET /status tells you if a WhatsApp
              session is linked. If not, show the QR barcode from this API and
              scan it in WhatsApp.
            </p>
          </div>
          <AppNav />
        </div>
      </div>

      <main className="px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card title="Base URL" description="Use your VPS IP:3002 or your Render URL.">
            <p className="font-mono text-sm text-foreground">{api}</p>
            <p className="mt-2 text-sm text-foreground-muted">
              OpenAPI spec:{' '}
              <a
                className="text-primary hover:underline"
                href="/api/v1/openapi.json"
              >
                /api/v1/openapi.json
              </a>
            </p>
          </Card>

          <Card
            title="Authentication"
            description="Every request except OpenAPI needs a key generated in this app."
          >
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              <li>
                Header <code className="text-xs">X-API-Key: whp_...</code>
              </li>
              <li>
                Or <code className="text-xs">Authorization: Bearer whp_...</code>
              </li>
            </ul>
            <p className="mt-3 text-sm text-foreground-muted">
              Invalid or revoked keys return HTTP 401. CORS origins are set with{' '}
              <code className="text-xs">OCEAN_CORS_ORIGINS</code>.
            </p>
          </Card>

          <Card
            title="OSINT connection flow"
            description="Use this when the OSINT app adds WhatsApp next to Facebook / Instagram API keys."
          >
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>
                Store this base URL and an API key (<code className="text-xs">whp_...</code>)
                in OSINT settings — same pattern as a RapidAPI key.
              </li>
              <li>
                Call <code className="text-xs">GET /status</code>. HTTP 200 means
                the API connection is OK. HTTP 401 means the key is wrong.
              </li>
              <li>
                If <code className="text-xs">whatsappAdded</code> is{' '}
                <code className="text-xs">false</code>, no WhatsApp is linked.
                Show <code className="text-xs">accounts[].qrCodeDataUrl</code>{' '}
                as a barcode image and poll every 2s until{' '}
                <code className="text-xs">ready</code> is true.
              </li>
              <li>
                On the phone: WhatsApp → Linked devices → Link a device → scan
                the barcode shown in OSINT.
              </li>
              <li>
                To add more numbers, <code className="text-xs">POST /accounts</code>{' '}
                and scan the new QR. Lookups rotate across connected sessions.
              </li>
            </ol>
          </Card>

          <Card title="Endpoints">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-foreground-muted">
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 font-medium">Path</th>
                    <th className="py-2 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">GET</td>
                    <td className="py-2 pr-3 font-mono text-xs">/status</td>
                    <td className="py-2">
                      API health + WhatsApp sessions (QR if none linked)
                    </td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">GET</td>
                    <td className="py-2 pr-3 font-mono text-xs">/accounts</td>
                    <td className="py-2">List WhatsApp accounts and QR barcodes</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">POST</td>
                    <td className="py-2 pr-3 font-mono text-xs">/accounts</td>
                    <td className="py-2">Add another WhatsApp slot (returns QR)</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">GET</td>
                    <td className="py-2 pr-3 font-mono text-xs">/accounts/:id</td>
                    <td className="py-2">Poll one account until scanned / ready</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">POST</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      /accounts/:id/disconnect
                    </td>
                    <td className="py-2">Logout that session and issue a new QR</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">DELETE</td>
                    <td className="py-2 pr-3 font-mono text-xs">/accounts/:id</td>
                    <td className="py-2">Remove a slot (cannot delete the last one)</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">POST</td>
                    <td className="py-2 pr-3 font-mono text-xs">/queue</td>
                    <td className="py-2">
                      Enqueue up to 20k numbers (loop for a million)
                    </td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">GET</td>
                    <td className="py-2 pr-3 font-mono text-xs">/queue</td>
                    <td className="py-2">Pending/done counts + worker status</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">POST</td>
                    <td className="py-2 pr-3 font-mono text-xs">/lookup</td>
                    <td className="py-2">
                      One number now (SQLite cache if already fetched)
                    </td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">POST</td>
                    <td className="py-2 pr-3 font-mono text-xs">/lookups</td>
                    <td className="py-2">List of numbers → async job</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">GET</td>
                    <td className="py-2 pr-3 font-mono text-xs">/lookups/:id</td>
                    <td className="py-2">Poll job until completed/failed</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs">GET</td>
                    <td className="py-2 pr-3 font-mono text-xs">/profiles</td>
                    <td className="py-2">
                      Search stored profiles (20/page) — name, about, photo URL
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-mono text-xs">GET</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      /profiles/:digits
                    </td>
                    <td className="py-2">
                      One stored profile for the OSINT app (404 if never fetched)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-foreground-muted">
              For large lists use <code className="text-xs">POST /queue</code>.
              The VPS worker fetches 50 numbers per linked WhatsApp, then rests
              20 minutes. Already stored profiles are never fetched again.
            </p>
          </Card>

          <Card title="curl examples">
            <CodeBlock title="Status (API + QR)" code={curlStatus} onCopy={copy} />
            <CodeBlock title="List WhatsApp accounts" code={curlAccounts} onCopy={copy} />
            <CodeBlock title="Add WhatsApp account" code={curlAddAccount} onCopy={copy} />
            <CodeBlock title="Poll one account / QR" code={curlOneAccount} onCopy={copy} />
            <CodeBlock title="Disconnect (new QR)" code={curlDisconnect} onCopy={copy} />
            <CodeBlock title="Delete extra account" code={curlDeleteAccount} onCopy={copy} />
            <CodeBlock title="Single lookup" code={curlLookup} onCopy={copy} />
            <CodeBlock title="Enqueue numbers" code={curlQueue} onCopy={copy} />
            <CodeBlock title="Queue status" code={curlQueueStatus} onCopy={copy} />
            <CodeBlock title="Start batch job" code={curlBatch} onCopy={copy} />
            <CodeBlock title="Poll job" code={curlPoll} onCopy={copy} />
            <CodeBlock title="Search stored profiles" code={curlProfiles} onCopy={copy} />
            <CodeBlock title="Get one stored profile" code={curlOneProfile} onCopy={copy} />
          </Card>

          <Card
            title="OSINT app — link WhatsApp (JavaScript)"
            description="Save the key on the OSINT backend. Render qrCodeDataUrl as an image. Poll until ready."
          >
            <CodeBlock
              title="checkWhatsAppApi / waitForQrOrReady / addWhatsAppAccount"
              code={oceanConnect}
              onCopy={copy}
            />
          </Card>

          <Card
            title="OSINT app — look up profiles (JavaScript)"
            description="Read stored profiles first, then live-lookup only if missing. Store the key on the OSINT backend, not in the browser."
          >
            <CodeBlock
              title="getStoredProfile / lookupOne / fetchProfileForOsint"
              code={oceanFetch}
              onCopy={copy}
            />
          </Card>
        </div>
      </main>
    </>
  );
}
