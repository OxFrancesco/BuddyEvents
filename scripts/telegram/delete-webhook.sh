#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
if [[ -z "${BOT_TOKEN}" ]]; then
  echo "Missing TELEGRAM_BOT_TOKEN (env or .env.local)."
  exit 1
fi

response="$(
  curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook" \
    --data-urlencode "drop_pending_updates=false"
)"

if command -v jq >/dev/null 2>&1; then
  ok="$(printf "%s" "${response}" | jq -r '.ok // false')"
else
  ok="$(printf "%s" "${response}" | grep -o '"ok":[^,}]*' | head -n1 | cut -d: -f2 | tr -d ' "')"
fi

if [[ "${ok}" != "true" ]]; then
  echo "Telegram deleteWebhook failed:"
  echo "${response}"
  exit 1
fi

echo "Webhook deleted successfully."
if command -v jq >/dev/null 2>&1; then
  printf "%s\n" "${response}" | jq
else
  echo "${response}"
fi
