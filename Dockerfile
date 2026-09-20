# WhatsApp Profile Fetcher — VPS / Docker (Chrome + Next.js)
FROM node:20-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci \
  && rm -rf /var/lib/apt/lists/*

FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV DBUS_SESSION_BUS_ADDRESS=/dev/null

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 \
    libxcomposite1 libxdamage1 libxrandr2 xdg-utils libu2f-udev libvulkan1 \
  && wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
  && apt-get install -y /tmp/chrome.deb \
  && rm -f /tmp/chrome.deb \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs nextjs

ENV HOME=/home/nextjs
ENV XDG_CONFIG_HOME=/home/nextjs/.config
ENV XDG_CACHE_HOME=/home/nextjs/.cache
ENV TMPDIR=/tmp

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/node_modules/sql.js/dist/sql-wasm.wasm ./sql-wasm.wasm

RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    'SESSION_BASE="${WWJS_SESSION_DIR:-/app/.wwebjs_auth}"' \
    'if [ -d "$SESSION_BASE" ]; then' \
    '  find "$SESSION_BASE" -type f \( -name SingletonLock -o -name SingletonSocket -o -name SingletonCookie -o -name lockfile \) -delete 2>/dev/null || true' \
    'fi' \
    'exec npm run start' \
    > /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p .wwebjs_auth /app/data /home/nextjs/.config /home/nextjs/.cache /tmp/chromium \
  && chown -R nextjs:nodejs .wwebjs_auth /app/data /home/nextjs /tmp/chromium /app/sql-wasm.wasm

USER nextjs

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
