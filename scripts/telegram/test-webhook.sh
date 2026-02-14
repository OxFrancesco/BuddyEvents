#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Telegram Bot Health-Check Suite
# Verifies webhook config, endpoint reachability, and secret auth.
# Usage:  ./scripts/telegram/test-webhook.sh [APP_URL]
# ─────────────────────────────────────────────────────────────────────
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
WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:-}"
EXPECTED_URL="${1:-${NEXT_PUBLIC_APP_URL:-}}"
EXPECTED_URL="${EXPECTED_URL%/}"

if [[ -z "${BOT_TOKEN}" ]]; then
  echo "❌ TELEGRAM_BOT_TOKEN is not set."
  exit 1
fi

PASS=0
FAIL=0
WARN=0

pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1"; }
warn() { WARN=$((WARN + 1)); echo "  ⚠️  $1"; }

# ── 1. Bot token validity ───────────────────────────────────────────
echo ""
echo "═══ 1. Bot Token ═══"
me_resp="$(curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getMe")"
me_ok="$(printf "%s" "${me_resp}" | jq -r '.ok // false')"
if [[ "${me_ok}" == "true" ]]; then
  bot_username="$(printf "%s" "${me_resp}" | jq -r '.result.username')"
  pass "Bot token valid — @${bot_username}"
else
  fail "Bot token invalid or revoked"
  echo "     ${me_resp}"
fi

# ── 2. Current webhook info ─────────────────────────────────────────
echo ""
echo "═══ 2. Webhook Info (getWebhookInfo) ═══"
info_resp="$(curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")"
wh_url="$(printf "%s" "${info_resp}" | jq -r '.result.url // ""')"
pending="$(printf "%s" "${info_resp}" | jq -r '.result.pending_update_count // 0')"
last_err="$(printf "%s" "${info_resp}" | jq -r '.result.last_error_message // ""')"

if [[ -n "${wh_url}" ]]; then
  pass "Webhook URL is set: ${wh_url}"
else
  fail "No webhook URL configured"
fi

# ── 2a. URL matches expected domain ─────────────────────────────────
if [[ -n "${EXPECTED_URL}" ]]; then
  expected_wh="${EXPECTED_URL}/api/telegram/webhook"
  if [[ "${wh_url}" == "${expected_wh}" ]]; then
    pass "Webhook URL matches expected: ${expected_wh}"
  else
    fail "Webhook URL mismatch"
    echo "     Expected: ${expected_wh}"
    echo "     Actual:   ${wh_url}"
  fi
else
  warn "No EXPECTED_URL provided — skipping URL match check."
fi

# ── 2b. Pending updates ─────────────────────────────────────────────
if [[ "${pending}" == "0" ]]; then
  pass "No pending updates"
else
  warn "${pending} pending update(s) — Telegram cannot reach the webhook"
fi

# ── 2c. Last error ──────────────────────────────────────────────────
if [[ -z "${last_err}" ]]; then
  pass "No recent webhook errors"
else
  fail "Last webhook error: ${last_err}"
fi

# ── 3. Endpoint reachability (HEAD/GET returns 405 — method not allowed is fine) ─
echo ""
echo "═══ 3. Endpoint Reachability ═══"
if [[ -n "${EXPECTED_URL}" ]]; then
  probe_url="${EXPECTED_URL}/api/telegram/webhook"
  http_code="$(curl -sS -o /dev/null -w "%{http_code}" -X GET "${probe_url}" 2>/dev/null || echo "000")"
  if [[ "${http_code}" == "405" || "${http_code}" == "200" ]]; then
    pass "Endpoint reachable (HTTP ${http_code}): ${probe_url}"
  elif [[ "${http_code}" == "000" ]]; then
    fail "Cannot connect to ${probe_url} — DNS or network error"
  else
    warn "Endpoint returned HTTP ${http_code} (expected 405 for GET on a POST-only route)"
  fi
else
  warn "Skipping reachability check — no EXPECTED_URL"
fi

# ── 4. POST without secret → expect 401 ─────────────────────────────
echo ""
echo "═══ 4. Auth Guard (no secret → 401) ═══"
if [[ -n "${EXPECTED_URL}" ]]; then
  probe_url="${EXPECTED_URL}/api/telegram/webhook"
  no_auth_code="$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST -H "content-type: application/json" \
    -d '{"message":{"text":"/ping","chat":{"id":1}}}' \
    "${probe_url}" 2>/dev/null || echo "000")"
  if [[ "${no_auth_code}" == "401" ]]; then
    pass "Unauthorized request correctly rejected (HTTP 401)"
  elif [[ "${no_auth_code}" == "000" ]]; then
    fail "Cannot connect to ${probe_url}"
  else
    fail "Expected 401 without secret, got HTTP ${no_auth_code}"
  fi
else
  warn "Skipping — no EXPECTED_URL"
fi

# ── 5. POST with valid secret → expect 200 ──────────────────────────
echo ""
echo "═══ 5. Auth Guard (valid secret → 200) ═══"
if [[ -n "${EXPECTED_URL}" && -n "${WEBHOOK_SECRET}" ]]; then
  probe_url="${EXPECTED_URL}/api/telegram/webhook"
  # Send a harmless update with no text so the handler returns {ok:true} quickly.
  auth_code="$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST -H "content-type: application/json" \
    -H "x-telegram-bot-api-secret-token: ${WEBHOOK_SECRET}" \
    -d '{"update_id":0}' \
    "${probe_url}" 2>/dev/null || echo "000")"
  if [[ "${auth_code}" == "200" ]]; then
    pass "Authenticated request accepted (HTTP 200)"
  elif [[ "${auth_code}" == "000" ]]; then
    fail "Cannot connect to ${probe_url}"
  else
    fail "Expected 200 with valid secret, got HTTP ${auth_code}"
  fi
else
  if [[ -z "${WEBHOOK_SECRET}" ]]; then
    warn "Skipping — TELEGRAM_WEBHOOK_SECRET not set"
  else
    warn "Skipping — no EXPECTED_URL"
  fi
fi

# ── 6. Bot commands registered ──────────────────────────────────────
echo ""
echo "═══ 6. Bot Commands ═══"
cmds_resp="$(curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getMyCommands")"
cmds_ok="$(printf "%s" "${cmds_resp}" | jq -r '.ok // false')"
cmds_count="$(printf "%s" "${cmds_resp}" | jq '.result | length')"
if [[ "${cmds_ok}" == "true" && "${cmds_count}" -gt "0" ]]; then
  pass "${cmds_count} command(s) registered"
  printf "%s" "${cmds_resp}" | jq -r '.result[] | "     /\(.command) — \(.description)"'
else
  warn "No bot commands registered (run scripts/telegram/set-commands.sh)"
fi

# ── Summary ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: ${PASS} passed · ${FAIL} failed · ${WARN} warnings"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "${FAIL}" -gt 0 ]]; then
  echo ""
  echo "💡 Common fixes:"
  echo "   • Wrong URL → run: NEXT_PUBLIC_APP_URL=https://events.buddytools.org ./scripts/telegram/set-webhook.sh"
  echo "   • 401 errors → ensure TELEGRAM_WEBHOOK_SECRET in .env.local matches what was sent in set-webhook.sh"
  echo "   • Flush stuck updates → ./scripts/telegram/delete-webhook.sh then re-set"
  exit 1
fi

exit 0
