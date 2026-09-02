# WhatsApp Profile Fetcher

Educational Next.js app that fetches WhatsApp profile picture URLs from phone numbers. It uses [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) to automate WhatsApp Web (same as linking a device in the mobile app).

> **Warning:** This uses unofficial methods and may violate WhatsApp's Terms of Service. Your account can be banned. Use only for learning on a test account. Do not use in production.

---

## Features

- Single phone number lookup
- Batch lookup (one number per line)
- WhatsApp client status + QR code in the UI
- Persistent login session (saved locally)
- In-memory caching of profile picture URLs
- Pakistan-friendly number formatting (`0311…` → `92311…`)

---

## Tech stack

| Layer | Libraries |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| WhatsApp | whatsapp-web.js (+ Puppeteer / Chrome) |
| QR codes | qrcode (UI), qrcode-terminal (terminal) |

---

## Prerequisites

Before you start, install:

1. **Node.js 20+** — [https://nodejs.org](https://nodejs.org)
2. **npm** (comes with Node)
3. **Google Chrome or Microsoft Edge** — Puppeteer drives a real browser. On Windows, the app auto-detects Chrome/Edge if Puppeteer's bundled Chrome is missing.
4. **A WhatsApp account** on your phone — used only to scan the QR code and link the session

---

## Complete setup

### 1. Clone or download the repo

```bash
git clone <your-repo-url>
cd whatsapp-profile-fetcher
```

Or open the project folder you already have.

### 2. Install dependencies

```bash
npm install
```

This installs Next.js, React, whatsapp-web.js, qrcode, and dev tools (TypeScript, Tailwind, ESLint).

### 3. Configure environment variables

Copy the example env file:

```bash
cp .env.example .env.local
```

On Windows (PowerShell):

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` if needed:

```env
# Port for the dev server (default 3000)
PORT=3000

# Where whatsapp-web.js saves the linked session
WWJS_SESSION_DIR=.wwebjs_auth

# Default country code for 10-digit numbers without a prefix (Pakistan = 92)
WWJS_DEFAULT_COUNTRY_CODE=92

# Optional: only if Chrome is not found automatically
# PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Dev server port |
| `WWJS_SESSION_DIR` | `.wwebjs_auth` | Session folder (gitignored; contains login data) |
| `WWJS_DEFAULT_COUNTRY_CODE` | `92` | Used when a 10-digit number has no country code |
| `PUPPETEER_EXECUTABLE_PATH` | (auto) | Path to Chrome or Edge executable |

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The first compile may take a few seconds. Status polls every 5 seconds until WhatsApp is ready.

### 5. Link WhatsApp (first time)

1. Wait for the **QR code** on the page (or in the terminal).
2. On your phone: **WhatsApp → Menu (⋮) → Linked devices → Link a device**.
3. Scan the QR code.
4. When status shows **Ready**, you can fetch profile pictures.

The session is saved under `.wwebjs_auth`. After a restart, you usually do not need to scan again unless you clicked **Reset Client** or deleted that folder.

### 6. Fetch a profile picture

**Single lookup**

1. Enter a phone number, for example:
   - `03110365141` (Pakistan local)
   - `923110365141` or `+923110365141` (international)
2. Click **Fetch**.
3. If available and privacy allows, the profile image appears.

**Batch lookup**

1. Paste numbers in the textarea (one per line).
2. Click **Fetch All**.
3. Results show in a table (with a short delay between each number).

---

## NPM scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run production server (run `build` first) |
| `npm run lint` | Run ESLint |

Production run:

```bash
npm run build
npm run start
```

---

## How it works (short)

```
Browser (React UI)
    ↓ fetch /api/whatsapp
Next.js API route
    ↓ phone normalize + cache check
whatsapp-web.js + Puppeteer (headless Chrome)
    ↓ web.whatsapp.com (your linked session)
WhatsApp servers → profile picture URL
    ↓ JSON response
Browser shows <img> with the URL
```

1. You open the site; the server starts WhatsApp Web in the background.
2. You scan QR once; session is stored in `.wwebjs_auth`.
3. You enter a number; the API formats it (e.g. `0311…` → `92311…`).
4. The library asks WhatsApp for that contact's profile photo URL.
5. The UI displays the image or a privacy / not-found message.

---

## API reference

Base path: `/api/whatsapp`

### `GET ?checkStatus=true`

Returns client state: `ready`, `qrCodeDataUrl`, `message`, etc.

### `GET ?phone=<number>`

Fetch one profile picture.

Optional: `&refresh=true` to bypass cache.

### `POST` JSON body

**Batch fetch**

```json
{
  "action": "fetchMultiple",
  "phones": ["03110365141", "923110365141"]
}
```

**Reset session and cache**

```json
{
  "action": "reset"
}
```

---

## Project structure

```
whatsapp-profile-fetcher/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main UI
│   │   ├── layout.tsx            # Root layout
│   │   └── api/whatsapp/route.ts # API endpoints
│   └── lib/
│       ├── whatsapp-client.ts    # WhatsApp + Puppeteer singleton
│       ├── phone.ts              # Number normalization
│       ├── profile-cache.ts      # In-memory URL cache
│       └── errors.ts             # Error helpers
├── public/
│   └── fallback-avatar.svg       # Placeholder if image fails to load
├── .env.example                  # Env template
├── .env.local                    # Your local config (create this)
├── .wwebjs_auth/                 # WhatsApp session (created at runtime)
├── next.config.ts                # serverExternalPackages for Puppeteer
└── package.json
```

---

## Troubleshooting

### Turbopack / webpack config error on `npm run dev`

This project uses Next.js 16 with Turbopack. `next.config.ts` only sets `serverExternalPackages` (no webpack block). If you see an old webpack error, pull the latest `next.config.ts` and restart.

### "Could not find Chrome" / Puppeteer browser missing

Install Google Chrome or Edge, or set in `.env.local`:

```env
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Or install Puppeteer's Chrome:

```bash
npx puppeteer browsers install chrome
```

### Status stuck on "Initializing…"

- Wait 10–20 seconds after the server starts.
- Click **Refresh**.
- Check the terminal for `WhatsApp client authenticated!` or errors.
- Avoid clicking **Reset Client** unless you want to relink.
- Restart: stop the server (`Ctrl+C`), then `npm run dev` again.

### "Failed to fetch" in the browser console on load

Often happens during hot reload or first compile. Refresh the page once the server is ready.

### "No LID for user" or cryptic errors like `"r"`

WhatsApp's internal IDs changed over time. This repo uses a custom lookup path in `lookupProfilePicture()` to reduce those errors. Use full international numbers when possible (`923110365141`).

### No profile picture / privacy message

The number may have no photo, not be on WhatsApp, or privacy settings block viewers who are not contacts.

### Fetch button disabled

WhatsApp is not **Ready** yet. Scan QR or wait for authentication to finish.

---

## Security notes

- `.wwebjs_auth` contains your WhatsApp session — **never commit it** (already in `.gitignore`).
- `.env.local` is gitignored; do not commit secrets.
- Run locally only; deploying to serverless hosts (e.g. Vercel) is not practical because of Puppeteer and long-lived sessions.

---

## Limitations

- One WhatsApp session per server process
- In-memory cache clears on server restart or reset
- Unofficial API — can break when WhatsApp Web updates
- Batch mode adds ~400 ms delay between numbers to reduce load
- Educational use only

---

## License

Private / educational project. Respect WhatsApp's terms and local privacy laws when handling phone numbers.
