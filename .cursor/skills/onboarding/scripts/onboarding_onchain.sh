#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  onboarding_onchain.sh --contract <0x...> [options]

Options:
  --contract <addr>        BuddyEvents contract address (required)
  --rpc <url>              Monad RPC URL (default: https://testnet-rpc.monad.xyz)
  --event-name <name>      Event name (default: BuddyEvents ONBOARDING)
  --price-usdc-units <n>   Price in USDC smallest units (default: 0)
  --max-tickets <n>        Max tickets (default: 25)
  --organizer-config <p>   Organizer config path (default: ~/.buddyevents/onboarding_organizer.json)
  --buyer-config <p>       Buyer config path (default: ~/.buddyevents/onboarding_buyer.json)
  --create-convex          Also create/link matching Convex event
  --convex-team-id <id>    Team ID for Convex event creation (required with --create-convex)
  --convex-service-token <token>
                           Convex service token (required with --create-convex unless env set)
  --skip-fund              Skip faucet requests
  -h, --help               Show help
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

CONTRACT=""
RPC="https://testnet-rpc.monad.xyz"
EVENT_NAME="BuddyEvents ONBOARDING"
PRICE_USDC_UNITS="0"
MAX_TICKETS="25"
ORG_CFG="${HOME}/.buddyevents/onboarding_organizer.json"
BUYER_CFG="${HOME}/.buddyevents/onboarding_buyer.json"
SKIP_FUND=0
CREATE_CONVEX=0
CONVEX_TEAM_ID=""
CONVEX_SERVICE_TOKEN_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --contract)
      CONTRACT="${2:-}"
      shift 2
      ;;
    --rpc)
      RPC="${2:-}"
      shift 2
      ;;
    --event-name)
      EVENT_NAME="${2:-}"
      shift 2
      ;;
    --price-usdc-units)
      PRICE_USDC_UNITS="${2:-}"
      shift 2
      ;;
    --max-tickets)
      MAX_TICKETS="${2:-}"
      shift 2
      ;;
    --organizer-config)
      ORG_CFG="${2:-}"
      shift 2
      ;;
    --buyer-config)
      BUYER_CFG="${2:-}"
      shift 2
      ;;
    --create-convex)
      CREATE_CONVEX=1
      shift
      ;;
    --convex-team-id)
      CONVEX_TEAM_ID="${2:-}"
      shift 2
      ;;
    --convex-service-token)
      CONVEX_SERVICE_TOKEN_ARG="${2:-}"
      shift 2
      ;;
    --skip-fund)
      SKIP_FUND=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${CONTRACT}" ]]; then
  echo "Error: --contract is required" >&2
  usage
  exit 1
fi

if [[ ! "${CONTRACT}" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "Error: invalid contract address: ${CONTRACT}" >&2
  exit 1
fi

if [[ ! "${PRICE_USDC_UNITS}" =~ ^[0-9]+$ ]]; then
  echo "Error: --price-usdc-units must be an integer >= 0" >&2
  exit 1
fi

if [[ ! "${MAX_TICKETS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: --max-tickets must be an integer > 0" >&2
  exit 1
fi

require_cmd go
require_cmd cast
require_cmd jq
require_cmd curl

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../../" && pwd)"
CLI_DIR="${REPO_ROOT}/cli"
CLI_BIN="${CLI_DIR}/buddyevents"
DEFAULT_CFG="${HOME}/.buddyevents/config.json"
ORIGINAL_DEFAULT_BACKUP=""

if [[ -f "${DEFAULT_CFG}" ]]; then
  ORIGINAL_DEFAULT_BACKUP="$(mktemp)"
  cp "${DEFAULT_CFG}" "${ORIGINAL_DEFAULT_BACKUP}"
fi

restore_default_config() {
  if [[ -n "${ORIGINAL_DEFAULT_BACKUP}" && -f "${ORIGINAL_DEFAULT_BACKUP}" ]]; then
    mkdir -p "$(dirname "${DEFAULT_CFG}")"
    cp "${ORIGINAL_DEFAULT_BACKUP}" "${DEFAULT_CFG}"
    rm -f "${ORIGINAL_DEFAULT_BACKUP}"
  else
    rm -f "${DEFAULT_CFG}"
  fi
}

trap restore_default_config EXIT

echo "[1/8] Building CLI binary..."
(cd "${CLI_DIR}" && go build -o buddyevents .)

ensure_wallet() {
  local cfg="$1"
  if [[ -f "${cfg}" ]] && jq -e '.private_key and .wallet_address' "${cfg}" >/dev/null 2>&1; then
    echo "Wallet already exists: ${cfg}"
    return
  fi
  mkdir -p "$(dirname "${cfg}")"
  echo "Creating wallet: ${cfg}"
  "${CLI_BIN}" wallet setup >/dev/null
  if [[ ! -f "${DEFAULT_CFG}" ]]; then
    echo "Error: wallet setup did not produce ${DEFAULT_CFG}" >&2
    exit 1
  fi
  cp "${DEFAULT_CFG}" "${cfg}"
}

patch_config() {
  local cfg="$1"
  local tmp
  tmp="$(mktemp)"
  jq \
    --arg c "${CONTRACT}" \
    --arg r "${RPC}" \
    --arg u "0x534b2f3A21130d7a60830c2Df862319e593943A3" \
    '.contract_address = $c | .monad_rpc = $r | .usdc_address = $u' \
    "${cfg}" > "${tmp}"
  mv "${tmp}" "${cfg}"
}

maybe_fund_wallet() {
  local cfg="$1"
  if [[ "${SKIP_FUND}" -eq 1 ]]; then
    return
  fi
  echo "Requesting MON faucet for: ${cfg}"
  if ! "${CLI_BIN}" --config "${cfg}" wallet fund; then
    echo "Warning: faucet request failed (likely rate limit). Continue after funding manually." >&2
  fi
}

wait_for_receipt() {
  local tx_hash="$1"
  local attempts="${2:-90}"
  local delay_secs="${3:-2}"
  local i
  for ((i=1; i<=attempts; i++)); do
    local response
    response="$(curl -sS --max-time 20 \
      -H "content-type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionReceipt\",\"params\":[\"${tx_hash}\"],\"id\":1}" \
      "${RPC}")"

    local result
    result="$(echo "${response}" | jq -c '.result')"
    if [[ "${result}" != "null" ]]; then
      echo "${result}"
      return 0
    fi
    sleep "${delay_secs}"
  done

  return 1
}

create_convex_event() {
  local event_name="$1"
  local onchain_event_id="$2"
  local onchain_tx="$3"
  local creator_address="$4"

  local convex_service_token="${CONVEX_SERVICE_TOKEN_ARG:-${CONVEX_SERVICE_TOKEN:-}}"
  if [[ -z "${convex_service_token}" ]]; then
    echo "Error: Convex service token missing. Pass --convex-service-token or set CONVEX_SERVICE_TOKEN." >&2
    exit 1
  fi
  if [[ -z "${CONVEX_TEAM_ID}" ]]; then
    echo "Error: --convex-team-id is required when --create-convex is set." >&2
    exit 1
  fi

  require_cmd npx

  local start_ms end_ms payload convex_event_id
  start_ms=$(( $(date +%s) * 1000 + 3600000 ))
  end_ms=$(( start_ms + 7200000 ))

  payload="{\"name\":\"${event_name}\",\"description\":\"Created via ONBOARDING skill. On-chain eventId=${onchain_event_id}, tx=${onchain_tx}, contract=${CONTRACT}\",\"startTime\":${start_ms},\"endTime\":${end_ms},\"price\":0,\"maxTickets\":${MAX_TICKETS},\"teamId\":\"${CONVEX_TEAM_ID}\",\"location\":\"Monad testnet\",\"creatorAddress\":\"${creator_address}\",\"serviceToken\":\"${convex_service_token}\"}"

  convex_event_id="$(cd "${REPO_ROOT}" && npx convex run events:create "${payload}")"
  convex_event_id="$(echo "${convex_event_id}" | tr -d '"')"
  if [[ -z "${convex_event_id}" ]]; then
    echo "Error: failed to create Convex event." >&2
    exit 1
  fi

  cd "${REPO_ROOT}" && npx convex run events:setOnChainData "{\"id\":\"${convex_event_id}\",\"onChainEventId\":${onchain_event_id},\"contractAddress\":\"${CONTRACT}\"}" >/dev/null

  echo "${convex_event_id}"
}

echo "[2/8] Ensuring organizer + buyer wallets exist..."
ensure_wallet "${ORG_CFG}"
ensure_wallet "${BUYER_CFG}"

echo "[3/8] Funding wallets with MON..."
maybe_fund_wallet "${ORG_CFG}"
maybe_fund_wallet "${BUYER_CFG}"

echo "[4/8] Writing contract + RPC config..."
patch_config "${ORG_CFG}"
patch_config "${BUYER_CFG}"

ORG_ADDR="$(jq -r '.wallet_address' "${ORG_CFG}")"
BUYER_ADDR="$(jq -r '.wallet_address' "${BUYER_CFG}")"
ORG_PK="$(jq -r '.private_key' "${ORG_CFG}")"

echo "Organizer wallet: ${ORG_ADDR}"
echo "Buyer wallet:     ${BUYER_ADDR}"

echo "[5/8] Creating event on-chain..."
CREATE_TX="$(cast send \
  --async \
  --rpc-url "${RPC}" \
  --private-key "${ORG_PK}" \
  "${CONTRACT}" \
  "createEvent(string,uint256,uint256)" \
  "${EVENT_NAME}" \
  "${PRICE_USDC_UNITS}" \
  "${MAX_TICKETS}" | grep -Eo '0x[a-fA-F0-9]{64}' | head -n1)"

if [[ -z "${CREATE_TX}" ]]; then
  echo "Error: could not parse createEvent transaction hash" >&2
  exit 1
fi
echo "createEvent tx: ${CREATE_TX}"

if ! RECEIPT_JSON="$(wait_for_receipt "${CREATE_TX}")"; then
  echo "Error: timed out waiting for createEvent receipt: ${CREATE_TX}" >&2
  exit 1
fi
EVENT_TOPIC="$(cast keccak "EventCreated(uint256,string,uint256,uint256,address)")"
EVENT_ID_HEX="$(echo "${RECEIPT_JSON}" | jq -r --arg t "${EVENT_TOPIC}" '.logs[] | select(.topics[0] == $t) | .topics[1]' | head -n1)"

if [[ -z "${EVENT_ID_HEX}" || "${EVENT_ID_HEX}" == "null" ]]; then
  echo "Error: failed to parse EventCreated log" >&2
  exit 1
fi

EVENT_ID="$(cast --to-dec "${EVENT_ID_HEX}")"
echo "Event ID: ${EVENT_ID}"

echo "[6/8] Verifying event state and subscription target..."
cast call \
  --rpc-url "${RPC}" \
  "${CONTRACT}" \
  "getEvent(uint256)(string,uint256,uint256,uint256,address,bool)" \
  "${EVENT_ID}"

echo "Subscription/watch command:"
echo "watch -n 5 \"cast call --rpc-url ${RPC} ${CONTRACT} 'getEvent(uint256)(string,uint256,uint256,uint256,address,bool)' ${EVENT_ID}\""

CONVEX_EVENT_ID=""
if [[ "${CREATE_CONVEX}" -eq 1 ]]; then
  echo "[convex] Creating and linking Convex event..."
  CONVEX_EVENT_ID="$(create_convex_event "${EVENT_NAME}" "${EVENT_ID}" "${CREATE_TX}" "${ORG_ADDR}")"
  echo "[convex] Convex event ID: ${CONVEX_EVENT_ID}"
fi

echo "[7/8] Buying ticket from buyer wallet..."
BUY_OUT="$("${CLI_BIN}" --config "${BUYER_CFG}" tickets buy --on-chain-id "${EVENT_ID}" 2>&1)" || {
  echo "${BUY_OUT}" >&2
  exit 1
}
echo "${BUY_OUT}"

BUY_TX="$(echo "${BUY_OUT}" | grep -Eo '0x[a-fA-F0-9]{64}' | tail -n1)"
if [[ -n "${BUY_TX}" ]]; then
  TICKET_TOPIC="$(cast keccak "TicketPurchased(uint256,uint256,address,uint256)")"
  BUY_RECEIPT="$(cast receipt --rpc-url "${RPC}" "${BUY_TX}" --json)"
  TICKET_ID_HEX="$(echo "${BUY_RECEIPT}" | jq -r --arg t "${TICKET_TOPIC}" '.logs[] | select(.topics[0] == $t) | .topics[2]' | head -n1)"
  if [[ -n "${TICKET_ID_HEX}" && "${TICKET_ID_HEX}" != "null" ]]; then
    TICKET_ID="$(cast --to-dec "${TICKET_ID_HEX}")"
    OWNER="$(cast call --rpc-url "${RPC}" "${CONTRACT}" "ownerOf(uint256)(address)" "${TICKET_ID}")"
    echo "Ticket ID: ${TICKET_ID}"
    echo "Ticket owner: ${OWNER}"
  fi
fi

echo "[8/8] Onboarding complete."
echo "Organizer config: ${ORG_CFG}"
echo "Buyer config:     ${BUYER_CFG}"
echo "Created event ID: ${EVENT_ID}"
if [[ -n "${CONVEX_EVENT_ID}" ]]; then
  echo "Convex event ID:  ${CONVEX_EVENT_ID}"
fi
