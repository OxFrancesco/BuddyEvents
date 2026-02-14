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

response="$(curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")"

if command -v jq >/dev/null 2>&1; then
  printf "%s\n" "${response}" | jq
else
  echo "${response}"
fi
