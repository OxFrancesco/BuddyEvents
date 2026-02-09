# BuddyEvents Demo Script

## Pi Agent End-to-End Demo

This demonstrates two AI agents (Pi agents) autonomously creating and buying event tickets on Monad.

### Prerequisites

1. Deploy the BuddyEvents contract to Monad testnet
2. Start the Next.js + Convex dev server
3. Build the Go CLI: `cd cli && go build -o buddyevents .`

### Setup

```bash
# Terminal 1: Start the app
cd /path/to/BuddyEvents
bun run dev

# Terminal 2: Build CLI
cd cli
go build -o buddyevents .
export PATH=$PATH:$(pwd)
```

### Demo Flow: Agent A creates event, Agent B buys ticket

```bash
# ===== AGENT A: Event Organizer =====

# 1. Setup wallet for Agent A
buddyevents wallet setup
# Output: Wallet created! Address: 0x...

# 2. Fund wallet with testnet MON
buddyevents wallet fund
# Output: Funded! Tx: 0x...

# 3. Check balance
buddyevents wallet balance
# Output: MON: 1.000000, USDC: 0.000000

# 4. Register as an agent
buddyevents agent register --name "OrganizerBot" --owner 0xHumanOwnerAddress

# 5. Create a team (via API)
curl -X POST http://localhost:3000/api/teams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monad Builders",
    "description": "Building the future on Monad",
    "walletAddress": "0xAgentAAddress",
    "members": ["0xAgentAAddress"]
  }'
# Response: {"teamId": "abc123..."}

# 6. Create an event
buddyevents events create \
  --name "Monad Builder Night" \
  --start 1741046400000 \
  --end 1741060800000 \
  --price 0.01 \
  --max-tickets 50 \
  --team-id abc123... \
  --location "San Francisco, CA"
# Output: Event created: xyz789...

# 7. List events to verify
buddyevents events list
# Output: [{ "name": "Monad Builder Night", "price": 0.01, ... }]
```

```bash
# ===== AGENT B: Ticket Buyer =====

# 1. Setup wallet for Agent B
buddyevents wallet setup
# Output: Wallet created! Address: 0x...

# 2. Fund wallet
buddyevents wallet fund

# 3. Register agent
buddyevents agent register --name "AttendeeBot" --owner 0xHumanOwnerB

# 4. Discover events
buddyevents events list --status active
# Output: Shows "Monad Builder Night"

# 5. Buy ticket (on-chain via Monad)
buddyevents tickets buy --on-chain-id 0 --event-id xyz789...
# Output:
#   Buying ticket on-chain via Monad...
#   Approving USDC...
#   Approve tx: 0x...
#   Buying ticket...
#   Buy tx: 0x...
#   Ticket purchased successfully on Monad!
#   Ticket recorded: ticket123...

# 6. Check my tickets
buddyevents tickets list
# Output: [{ "eventId": "xyz789...", "status": "active", "txHash": "0x..." }]
```

### Demo Flow: Web UI (Human)

1. Open http://localhost:3000
2. Browse events on the landing page
3. Click an event to see details
4. Connect wallet (MetaMask/Phantom with Monad testnet)
5. Click "Approve & Buy" to purchase with USDC
6. View ticket on "My Tickets" page

### Demo Flow: x402 Payment (Agent via HTTP)

```bash
# Agent makes HTTP request to x402-protected endpoint
curl http://localhost:3000/api/events/xyz789/buy?buyer=0xAgentAddress

# Server responds with HTTP 402 + payment requirements
# Agent signs ERC-3009 TransferWithAuthorization
# Agent retries with payment signature in header
# Server verifies, settles via Monad facilitator, records ticket
```

## Architecture Summary

```
Pi Agent (Bash) -> Go CLI -> { Monad Contract (on-chain) + Convex (off-chain) }
Browser (Human) -> Next.js -> { wagmi/viem (on-chain) + Convex (reactive) }
Any Agent (HTTP) -> x402 API -> { Facilitator (settlement) + Convex (record) }
```

## Key Addresses (Testnet)

- **Monad RPC:** https://testnet-rpc.monad.xyz
- **USDC:** 0x534b2f3A21130d7a60830c2Df862319e593943A3
- **x402 Facilitator:** https://x402-facilitator.molandak.org
- **Faucet (MON):** https://faucet.monad.xyz
- **Faucet (USDC):** https://faucet.circle.com (Monad Testnet)
