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

if [[ -z "${BOT_TOKEN}" ]]; then
  echo "Missing TELEGRAM_BOT_TOKEN (env or .env.local)."
  exit 1
fi

payload='{
  "commands": [
    {"command": "start", "description": "Start the BuddyEvents bot"},
    {"command": "help", "description": "Show command help and tips"},
    {"command": "events", "description": "List active events"},
    {"command": "tickets", "description": "List your tickets"},
    {"command": "wallet", "description": "Connect or fetch your wallet"},
    {"command": "buy", "description": "Buy a ticket: /buy <eventId>"},
    {"command": "qr", "description": "Generate QR for ticket: /qr <ticketId>"}
  ]
}'

response="$(
  curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
    -H "content-type: application/json" \
    -d "${payload}"
)"

if command -v jq >/dev/null 2>&1; then
  ok="$(printf "%s" "${response}" | jq -r '.ok // false')"
else
  ok="$(printf "%s" "${response}" | grep -o '"ok":[^,}]*' | head -n1 | cut -d: -f2 | tr -d ' "')"
fi

if [[ "${ok}" != "true" ]]; then
  echo "Telegram setMyCommands failed:"
  echo "${response}"
  exit 1
fi

echo "Commands configured successfully."
if command -v jq >/dev/null 2>&1; then
  printf "%s\n" "${response}" | jq
else
  echo "${response}"
fi
