#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

if [[ -f "${ENV_FILE}" ]]; then
  # Load local env defaults while keeping shell overrides.
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:-}"
APP_URL="${APP_URL:-${NEXT_PUBLIC_APP_URL:-}}"

if [[ -z "${BOT_TOKEN}" ]]; then
  echo "Missing TELEGRAM_BOT_TOKEN (env or .env.local)."
  exit 1
fi

if [[ -z "${WEBHOOK_SECRET}" ]]; then
  echo "Missing TELEGRAM_WEBHOOK_SECRET (env or .env.local)."
  exit 1
fi

if [[ -z "${APP_URL}" ]]; then
  echo "Missing APP_URL or NEXT_PUBLIC_APP_URL (env or .env.local)."
  exit 1
fi

APP_URL="${APP_URL%/}"
WEBHOOK_URL="${WEBHOOK_URL:-${APP_URL}/api/telegram/webhook}"

response="$(
  curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
    --data-urlencode "url=${WEBHOOK_URL}" \
    --data-urlencode "secret_token=${WEBHOOK_SECRET}" \
    --data-urlencode "allowed_updates=[\"message\"]"
)"

if command -v jq >/dev/null 2>&1; then
  ok="$(printf "%s" "${response}" | jq -r '.ok // false')"
else
  ok="$(printf "%s" "${response}" | grep -o '"ok":[^,}]*' | head -n1 | cut -d: -f2 | tr -d ' "')"
fi

if [[ "${ok}" != "true" ]]; then
  echo "Telegram setWebhook failed:"
  echo "${response}"
  exit 1
fi

echo "Webhook configured successfully."
echo "Webhook URL: ${WEBHOOK_URL}"
if command -v jq >/dev/null 2>&1; then
  printf "%s\n" "${response}" | jq
else
  echo "${response}"
fi
