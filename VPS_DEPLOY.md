# WA-hidden-profiles — Complete VPS Setup

**Target:** Ubuntu 22.04/24.04, Docker Compose, zip or git on the server.

Unlike ProbeForge (API `:8888` + dashboard `:3000` + Supabase), this app is **one Next.js service** with **WhatsApp Web (Puppeteer)** inside the container. **No database required.**

Default **host port 3002** (container still listens on 3000) so it does not clash with other apps on 3000/3001.

| Service | Host port | URL |
|---------|-----------|-----|
| WhatsApp Profile Fetcher | **3002** | `http://VPS_IP:3002` |

**Legal:** Only scan numbers you are authorized to look up. WhatsApp may ban linked devices.

---

## Will WhatsApp work on the VPS?

**Yes** — if you use a VPS (not Vercel). You need:

- Chromium in the container (included in `Dockerfile`)
- Persistent volume for `.wwebjs_auth` (WhatsApp login session)
- Enough RAM (**4 GB minimum**, **8 GB recommended** for Chromium + Node)

After deploy: open `http://VPS_IP:3002` → scan QR with your phone → use lookups.

---

## 0) Specs check (send to lead)

```bash
hostnamectl
lscpu | egrep "Model name|CPU\(s\)|Thread|Core|Architecture"
free -h
df -h /
```

**Recommended:** 2+ vCPU, **4–8 GB RAM**, 20 GB+ disk.

---

## 1) SSH into VPS

```bash
ssh root@YOUR_VPS_IP
passwd   # change root password if it was shared
```

---

## 2) System packages + Docker

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl unzip ufw

curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version
docker compose version
```

---

## 3) Firewall

```bash
ufw allow OpenSSH
ufw allow 3002/tcp
ufw --force enable
ufw status
```

(Later: put Nginx on 80/443 and close 3002 from the public internet.)

---

## 4) Upload project (zip method)

### On your Windows PC — create zip (exclude heavy folders)

Stop `pnpm run dev` / `npm run dev` first so `.next` is not locked.

```powershell
cd D:\MASOOD-WORK\PROJECTS\NEXT\WA-hidden-profiles

# tar is built into Windows 10+. This packs the project and skips secrets/sessions.
tar.exe -a -c -f ..\WA-hidden-profiles-deploy.zip `
  --exclude=node_modules `
  --exclude=.next `
  --exclude=.git `
  --exclude=.wwebjs_auth `
  --exclude=.wwebjs_cache `
  --exclude=data `
  --exclude=.env `
  --exclude=.env.local `
  --exclude=.env.vps `
  .
```

The zip lands next to the project folder: `D:\MASOOD-WORK\PROJECTS\NEXT\WA-hidden-profiles-deploy.zip`.

### Copy zip to VPS

Replace `YOUR_VPS_IP` with the server IP:

```powershell
scp D:\MASOOD-WORK\PROJECTS\NEXT\WA-hidden-profiles-deploy.zip root@YOUR_VPS_IP:/opt/
```

If `scp` asks about the host key, type `yes`. Then enter the root password.

### On VPS — unzip and start

```bash
mkdir -p /opt/wa-hidden-profiles
cd /opt/wa-hidden-profiles
unzip -o /opt/WA-hidden-profiles-deploy.zip
ls -la

# First deploy only: copy env template
test -f .env || cp .env.vps.example .env
nano .env   # set PUBLIC_BASE_URL=http://YOUR_VPS_IP:3002

docker compose -f docker-compose.vps.yml up -d --build
docker compose -f docker-compose.vps.yml logs -f --tail=80 app
```

Wait until Next.js is listening. `Ctrl+C` stops following logs (the container keeps running).

### Update later (keep .env and WhatsApp session)

```powershell
# on PC — new zip + upload
cd D:\MASOOD-WORK\PROJECTS\NEXT\WA-hidden-profiles
tar.exe -a -c -f ..\WA-hidden-profiles-deploy.zip --exclude=node_modules --exclude=.next --exclude=.git --exclude=.wwebjs_auth --exclude=.wwebjs_cache --exclude=data --exclude=.env --exclude=.env.local --exclude=.env.vps .
scp D:\MASOOD-WORK\PROJECTS\NEXT\WA-hidden-profiles-deploy.zip root@YOUR_VPS_IP:/opt/
```

```bash
# on VPS
cd /opt/wa-hidden-profiles
unzip -o /opt/WA-hidden-profiles-deploy.zip
docker compose -f docker-compose.vps.yml up -d --build
```

Do **not** run `docker compose down -v` unless you want to scan the QR again.

### Alternative: git clone

```bash
mkdir -p /opt/wa-hidden-profiles
cd /opt/wa-hidden-profiles
git clone https://github.com/YOUR_USER/WA-hidden-profiles.git .
```

---

## 5) Environment file

```bash
cd /opt/wa-hidden-profiles
cp .env.vps.example .env
cat .env
```

Edit if needed:

```bash
nano .env
```

No `DATABASE_URL` — unlike ProbeForge.

---

## 6) Start app (Docker)

```bash
cd /opt/wa-hidden-profiles
docker compose -f docker-compose.vps.yml up -d --build
docker compose -f docker-compose.vps.yml ps
docker compose -f docker-compose.vps.yml logs -f --tail=100 app
```

Wait until you see Next.js listening on `0.0.0.0:3000`. Press `Ctrl+C` to stop following logs.

**First build** may take 5–10 minutes (Chromium + `npm run build`).

---

## 7) Verify

From your laptop:

| URL | Expected |
|-----|----------|
| `http://YOUR_VPS_IP:3002` | Dashboard loads |
| Status panel | “Scan QR code” or “Connected” after login |

1. Open the site in your browser.
2. Click **Disconnect & Reconnect** if an old session is stuck.
3. Scan the QR code: WhatsApp → Linked devices → Link a device.
4. Run a test lookup (e.g. a number you are allowed to check).

---

## 8) Day-2 operations

```bash
cd /opt/wa-hidden-profiles

# status
docker compose -f docker-compose.vps.yml ps

# logs
docker compose -f docker-compose.vps.yml logs -f app

# restart after .env change
docker compose -f docker-compose.vps.yml up -d --build

# stop
docker compose -f docker-compose.vps.yml down

# stop and REMOVE WhatsApp session (must scan QR again)
# docker compose -f docker-compose.vps.yml down -v
```

### Update from new zip

```bash
cd /opt/wa-hidden-profiles
docker compose -f docker-compose.vps.yml down
# upload new zip, unzip over files (keep .env)
docker compose -f docker-compose.vps.yml up -d --build
```

**Persistent data:** Docker volume `wa_session` → WhatsApp login in `.wwebjs_auth`. Do not delete volume unless you want to re-scan QR.

---

## 9) Optional: Nginx + HTTPS

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Point a domain to `VPS_IP`, then proxy `https://yourdomain.com` → `http://127.0.0.1:3002`.

Lock UFW to `22`, `80`, `443` only.

**Important:** Add authentication (VPN, basic auth, or IP allowlist) before exposing publicly — anyone with the URL can use your linked WhatsApp session.

---

## 10) Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails “cannot access .wwebjs_auth” | Don’t zip `.wwebjs_auth`; build on VPS only |
| Stuck on Connecting | Use **Logout** in UI; or `docker compose ... down -v` and scan QR again |
| QR never appears | `docker compose logs app`; check RAM (`free -h`) |
| Chromium crash / `chrome_crashpad_handler` | Rebuild image (needs `HOME` + crashpad flags). Check RAM (`free -h`). |
| `profile appears to be in use` / Singleton lock | Stale Docker volume lock. Run fix below, then rebuild. |
| Port 3002 refused | `ufw allow 3002`; check `APP_HOST_PORT` in `.env`; `docker compose ps` |
| Session lost after restart | Without volume: use compose file’s `wa_session` volume |
| Slow lookups | Normal; scans run through real WhatsApp Web |

**Chromium profile lock (one-time fix on VPS):**

```bash
cd /opt/wa-hidden-profiles
docker compose -f docker-compose.vps.yml down
docker run --rm -v wa-hidden-profiles_wa_session:/data alpine sh -c \
  "rm -f /data/session/SingletonLock /data/session/SingletonSocket /data/session/SingletonCookie"
docker compose -f docker-compose.vps.yml up -d --build
```

If volume name differs: `docker volume ls` and replace `wa-hidden-profiles_wa_session`.

---

## Security checklist

- [ ] Changed root password / use SSH keys
- [ ] Firewall: only needed ports open
- [ ] Do not commit `.wwebjs_auth` or `.env` to git
- [ ] Restrict who can reach `:3002` (VPN or reverse proxy + auth)
- [ ] Understand ToS risk — unofficial WhatsApp automation

---

## 11) Ocean / public API

This app exposes a keyed API at `/api/v1` for Name Ocean (or any other client).

1. Open `http://VPS_IP:3002/settings` and generate an API key (`whp_...`). Copy it once.
2. Add to the VPS `.env`:

```bash
PUBLIC_BASE_URL=http://YOUR_VPS_IP:3002
OCEAN_CORS_ORIGINS=https://your-ocean-app.com
```

Use `*` for `OCEAN_CORS_ORIGINS` only while testing. Rebuild/restart is not required for `.env` if you already pass `env_file`, but restart the container after changing `.env`:

```bash
docker compose -f docker-compose.vps.yml up -d
```

3. Docs: `http://VPS_IP:3002/docs`  
   OpenAPI: `http://VPS_IP:3002/api/v1/openapi.json`

Ocean sends `X-API-Key: whp_...`.

- One number now: `POST /api/v1/lookup` (returns SQLite cache if already fetched)
- Million-number queue: `POST /api/v1/queue` in chunks of ≤20,000. The VPS worker fetches **50 per linked WhatsApp**, then **rests 20 minutes**, forever until the queue is empty.
- Queue status: `GET /api/v1/queue`

Do **not** expose QR/account management to Ocean — that stays on this dashboard.

---

## Compare to ProbeForge

| ProbeForge | WA-hidden-profiles |
|------------|-------------------|
| Ports 3000 + 8888 | Host port **3002** (app only) |
| Supabase `DATABASE_URL` | **SQLite** in the `wa_data` volume (`data/app.db`) |
| Ollama optional | **Not needed** |
| Scanner tools on host | **Chromium + WhatsApp Web in container** |
| `docker-compose.vps.yml` | App only |
