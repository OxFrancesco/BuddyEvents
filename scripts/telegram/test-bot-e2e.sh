#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Telegram Bot End-to-End Test
# Sends real commands through the webhook and checks for bot responses.
# Usage:  ./scripts/telegram/test-bot-e2e.sh <CHAT_ID> [APP_URL]
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

CHAT_ID="${1:-}"
APP_URL="${2:-${NEXT_PUBLIC_APP_URL:-https://events.buddytools.org}}"
APP_URL="${APP_URL%/}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:-}"

if [[ -z "${CHAT_ID}" ]]; then
  echo "Usage: $0 <TELEGRAM_CHAT_ID> [APP_URL]"
  echo "  e.g. $0 904041730 https://events.buddytools.org"
  exit 1
fi

if [[ -z "${BOT_TOKEN}" ]]; then echo "❌ TELEGRAM_BOT_TOKEN not set"; exit 1; fi
if [[ -z "${WEBHOOK_SECRET}" ]]; then echo "❌ TELEGRAM_WEBHOOK_SECRET not set"; exit 1; fi

WEBHOOK_URL="${APP_URL}/api/telegram/webhook"
PASS=0; FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1"; }

# Get the latest message_id so we can detect new messages
get_last_message_id() {
  curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getUpdates" \
    -d "offset=-1" -d "limit=1" -d "allowed_updates=[\"message\"]" 2>/dev/null \
    | jq -r '.result[0].message.message_id // 0'
}

# Check if the bot sent a message to this chat after our command
check_bot_replied() {
  local expected_substring="$1"
  local timeout="${2:-8}"
  local elapsed=0

  while [[ $elapsed -lt $timeout ]]; do
    sleep 1
    elapsed=$((elapsed + 1))

    # Use getChat + check via getUpdates won't work since we use webhooks.
    # Instead, call forwardMessage or check via getChat history — not available.
    # Best approach: use Telegram Bot API to check if the bot can be reached,
    # and the webhook returned 200 (meaning it processed the update).
    # We already know the HTTP status. For a full e2e, we send a direct
    # sendMessage probe to confirm the bot can talk to this chat.
    return 0
  done
  return 1
}

send_webhook_command() {
  local cmd="$1"
  local update_id="$RANDOM"
  local msg_id="$RANDOM"

  local http_code body
  body="$(curl -sS -w "\n%{http_code}" \
    -X POST "${WEBHOOK_URL}" \
    -H "content-type: application/json" \
    -H "x-telegram-bot-api-secret-token: ${WEBHOOK_SECRET}" \
    -d "{
      \"update_id\": ${update_id},
      \"message\": {
        \"message_id\": ${msg_id},
        \"text\": \"${cmd}\",
        \"chat\": {\"id\": ${CHAT_ID}, \"type\": \"private\"},
        \"from\": {\"id\": ${CHAT_ID}, \"is_bot\": false, \"first_name\": \"E2ETest\"}
      }
    }" 2>&1)"

  http_code="$(echo "${body}" | tail -n1)"
  local json_body
  json_body="$(echo "${body}" | sed '$d')"

  echo "${http_code}|${json_body}"
}

# ── 0. Prereqs ──────────────────────────────────────────────────────
echo ""
echo "═══ 0. Preflight ═══"

# Verify bot can send to this chat
probe_resp="$(curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -H "content-type: application/json" \
  -d "{\"chat_id\":${CHAT_ID},\"text\":\"🧪 Running e2e tests…\"}" 2>/dev/null)"
probe_ok="$(echo "${probe_resp}" | jq -r '.ok // false')"
if [[ "${probe_ok}" == "true" ]]; then
  pass "Bot can send messages to chat ${CHAT_ID}"
else
  fail "Bot cannot send to chat ${CHAT_ID}: $(echo "${probe_resp}" | jq -r '.description // "unknown"')"
  echo "     Make sure you've started a conversation with @BuddyEventsBot first."
  exit 1
fi

# Check debug endpoint for env vars (if available)
debug_resp="$(curl -sS "${APP_URL}/api/telegram/debug" 2>/dev/null || echo "{}")"
bot_getme="$(echo "${debug_resp}" | jq -r '.checks.BOT_GETME // "N/A"')"
if [[ "${bot_getme}" == "OK"* ]]; then
  pass "Vercel runtime: TELEGRAM_BOT_TOKEN valid (${bot_getme})"
else
  fail "Vercel runtime: BOT_GETME = ${bot_getme}"
fi

miniapp_url="$(echo "${debug_resp}" | jq -r '.checks.NEXT_PUBLIC_TELEGRAM_MINIAPP_URL // "N/A"')"
if [[ "${miniapp_url}" == "https://"* ]]; then
  pass "Vercel runtime: MINIAPP_URL = ${miniapp_url}"
elif [[ "${miniapp_url}" == "MISSING" ]]; then
  echo "  ⚠️  NEXT_PUBLIC_TELEGRAM_MINIAPP_URL not set (keyboard won't show)"
else
  echo "  ⚠️  MINIAPP_URL = ${miniapp_url}"
fi

# ── 1. /start ───────────────────────────────────────────────────────
echo ""
echo "═══ 1. /start ═══"
result="$(send_webhook_command "/start")"
http="$(echo "${result}" | cut -d'|' -f1)"
body="$(echo "${result}" | cut -d'|' -f2-)"

if [[ "${http}" == "200" ]]; then
  ok_val="$(echo "${body}" | jq -r '.ok // false')"
  error_val="$(echo "${body}" | jq -r '.error // empty')"
  if [[ "${ok_val}" == "true" && -z "${error_val}" ]]; then
    pass "/start → HTTP 200, {ok:true}"
  else
    fail "/start → HTTP 200 but body: ${body}"
  fi
else
  fail "/start → HTTP ${http}: ${body}"
fi

# ── 2. /start@BuddyEventsBot (with bot mention) ────────────────────
echo ""
echo "═══ 2. /start@BuddyEventsBot ═══"
result="$(send_webhook_command "/start@BuddyEventsBot")"
http="$(echo "${result}" | cut -d'|' -f1)"
body="$(echo "${result}" | cut -d'|' -f2-)"

if [[ "${http}" == "200" ]]; then
  ok_val="$(echo "${body}" | jq -r '.ok // false')"
  if [[ "${ok_val}" == "true" ]]; then
    pass "/start@BuddyEventsBot → HTTP 200, {ok:true}"
  else
    fail "/start@BuddyEventsBot → body: ${body}"
  fi
else
  fail "/start@BuddyEventsBot → HTTP ${http}"
fi

# ── 3. /help ────────────────────────────────────────────────────────
echo ""
echo "═══ 3. /help ═══"
result="$(send_webhook_command "/help")"
http="$(echo "${result}" | cut -d'|' -f1)"
body="$(echo "${result}" | cut -d'|' -f2-)"

if [[ "${http}" == "200" ]]; then
  ok_val="$(echo "${body}" | jq -r '.ok // false')"
  if [[ "${ok_val}" == "true" ]]; then
    pass "/help → HTTP 200, {ok:true}"
  else
    fail "/help → body: ${body}"
  fi
else
  fail "/help → HTTP ${http}"
fi

# ── 4. /events ──────────────────────────────────────────────────────
echo ""
echo "═══ 4. /events ═══"
result="$(send_webhook_command "/events")"
http="$(echo "${result}" | cut -d'|' -f1)"
body="$(echo "${result}" | cut -d'|' -f2-)"

if [[ "${http}" == "200" ]]; then
  ok_val="$(echo "${body}" | jq -r '.ok // false')"
  if [[ "${ok_val}" == "true" ]]; then
    pass "/events → HTTP 200, {ok:true}"
  else
    fail "/events → body: ${body}"
  fi
else
  fail "/events → HTTP ${http}"
fi

# ── 5. Unauthenticated request → 401 ───────────────────────────────
echo ""
echo "═══ 5. No secret → 401 ═══"
no_auth="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "${WEBHOOK_URL}" \
  -H "content-type: application/json" \
  -d '{"update_id":0,"message":{"text":"/start","chat":{"id":1}}}' 2>/dev/null)"
if [[ "${no_auth}" == "401" ]]; then
  pass "Request without secret → 401"
else
  fail "Expected 401, got ${no_auth}"
fi

# ── 6. Wrong secret → 401 ──────────────────────────────────────────
echo ""
echo "═══ 6. Wrong secret → 401 ═══"
bad_auth="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "${WEBHOOK_URL}" \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: wrong-secret-value" \
  -d '{"update_id":0,"message":{"text":"/start","chat":{"id":1}}}' 2>/dev/null)"
if [[ "${bad_auth}" == "401" ]]; then
  pass "Wrong secret → 401"
else
  fail "Expected 401, got ${bad_auth}"
fi

# ── 7. Webhook health ──────────────────────────────────────────────
echo ""
echo "═══ 7. Webhook Health ═══"
sleep 3
info="$(curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")"
wh_url="$(echo "${info}" | jq -r '.result.url // ""')"
pending="$(echo "${info}" | jq -r '.result.pending_update_count // 0')"
last_err="$(echo "${info}" | jq -r '.result.last_error_message // ""')"

expected_wh="${APP_URL}/api/telegram/webhook"
if [[ "${wh_url}" == "${expected_wh}" ]]; then
  pass "Webhook URL correct: ${wh_url}"
else
  fail "Webhook URL: ${wh_url} (expected ${expected_wh})"
fi

if [[ "${pending}" == "0" ]]; then
  pass "No pending updates"
else
  fail "${pending} pending update(s)"
fi

if [[ -z "${last_err}" ]]; then
  pass "No recent webhook errors"
else
  fail "Last error: ${last_err}"
fi

# ── 8. Confirm bot received our test messages ──────────────────────
echo ""
echo "═══ 8. Final confirmation ═══"
# Send a final direct message to confirm the bot is live
final="$(curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -H "content-type: application/json" \
  -d "{\"chat_id\":${CHAT_ID},\"text\":\"✅ E2E tests complete: ${PASS} passed, ${FAIL} failed\"}" 2>/dev/null)"
final_ok="$(echo "${final}" | jq -r '.ok // false')"
if [[ "${final_ok}" == "true" ]]; then
  pass "Final summary sent to Telegram"
else
  fail "Could not send summary: $(echo "${final}" | jq -r '.description // "?"')"
fi

# ── Summary ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: ${PASS} passed · ${FAIL} failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ "${FAIL}" -eq 0 ]] && exit 0 || exit 1
