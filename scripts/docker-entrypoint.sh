#!/bin/sh
set -e

SESSION_DIR="${WWJS_SESSION_DIR:-/app/.wwebjs_auth}/session"

if [ -d "$SESSION_DIR" ]; then
  rm -f \
    "$SESSION_DIR/SingletonLock" \
    "$SESSION_DIR/SingletonSocket" \
    "$SESSION_DIR/SingletonCookie" \
    2>/dev/null || true
fi

exec npm run start
