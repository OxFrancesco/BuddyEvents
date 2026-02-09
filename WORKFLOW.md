# BuddyEvents Test Workflow

This file is the canonical end-to-end test guide for BuddyEvents.

It validates all key features:
- Smart contracts (events + NFT tickets + marketplace)
- Convex backend (schema + CRUD)
- Next.js frontend flows
- x402 dynamic ticket payments on Monad
- Go CLI agent flows (Pi-compatible)
- Circle wallet integration paths

---

## 0) Prerequisites

- Bun installed
- Go installed
- Foundry installed (`forge`, `cast`)
- A Convex deployment URL
- Monad testnet wallet + funds
- Optional Circle API credentials

Required env (copy from `.env.example`):

```bash
cp .env.example .env.local
```

Set at least:
- `NEXT_PUBLIC_CONVEX_URL`
- `PAY_TO_ADDRESS`
- `NEXT_PUBLIC_BUDDY_EVENTS_CONTRACT` (after deploy)
- `PRIVATE_KEY` (for deploy/contract interactions)
- `NEXT_PUBLIC_WC_PROJECT_ID` (for wallet connect)

---

## 1) Install Dependencies

```bash
bun install
cd cli && go mod tidy && go build -o buddyevents . && cd ..
```

Expected:
- Bun install completes
- CLI binary builds with no errors

---

## 2) Quality Gate (Static Checks)

Run these before runtime tests:

```bash
bun run lint
npx tsc --noEmit --skipLibCheck
bun run build
cd cli && go build ./... && cd ..
cd contracts && forge test && cd ..
```

Expected:
- Lint: clean
- TS typecheck: clean
- Next build: success
- Go build: success
- Forge tests: `10 passed`

---

## 3) Smart Contract Workflow

### 3.1 Run contract tests

```bash
cd contracts
forge test
```

### 3.2 Deploy to Monad testnet

```bash
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Copy deployed address into:
- `.env.local` as `NEXT_PUBLIC_BUDDY_EVENTS_CONTRACT`
- `~/.buddyevents/config.json` as `contract_address`

---

## 4) Run App + Backend

From repo root:

```bash
bun run dev
```

Open:
- `http://localhost:3000`

Expected:
- Landing page renders
- Events list section visible
- Wallet connect buttons visible

---

## 5) Backend API Tests (REST + Convex)

## 5.1 Create a team

```bash
curl -X POST http://localhost:3000/api/teams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monad Builders",
    "description": "Core event team",
    "walletAddress": "0x1111111111111111111111111111111111111111",
    "members": ["0x1111111111111111111111111111111111111111"]
  }'
```

Expected:
- JSON includes `teamId`

### 5.2 Create an event

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monad Builder Night",
    "description": "Agent-native meetup",
    "startTime": 1765000000000,
    "endTime": 1765007200000,
    "price": 0.01,
    "maxTickets": 50,
    "teamId": "REPLACE_TEAM_ID",
    "location": "SF",
    "creatorAddress": "0x1111111111111111111111111111111111111111"
  }'
```

Expected:
- JSON includes `eventId`

### 5.3 List events

```bash
curl "http://localhost:3000/api/events?status=active"
```

Expected:
- `events` array contains created event

---

## 6) Frontend Feature Tests

## 6.1 Browse events
1. Go to `/events`
2. Verify cards render with:
   - Event name
   - Start date
   - Price
   - Spots left

## 6.2 Create event UI
1. Go to `/create`
2. Fill required fields
3. Submit
4. Verify redirect to `/events/[id]`

## 6.3 Event detail + buy flow
1. Open an event detail page
2. Connect wallet
3. Click `Approve & Buy` (paid event)
4. Confirm wallet txs
5. Click `Confirm Purchase` when prompted

Expected:
- Success state shown
- Ticket appears in `/tickets`

## 6.4 My tickets
1. Go to `/tickets`
2. Verify purchased tickets appear with:
   - Event name
   - Purchase price
   - Tx hash prefix
   - Status badge

---

## 7) x402 Dynamic Pricing + Settlement Tests

The buy endpoint now uses per-event dynamic x402 values and records facilitator settlement tx hashes.

### 7.1 Check 402 challenge for paid event

```bash
curl -i "http://localhost:3000/api/events/REPLACE_EVENT_ID/buy?buyer=0x2222222222222222222222222222222222222222"
```

Expected:
- HTTP `402`
- Payment requirement headers present
- Amount reflects the event's configured `price`

### 7.2 Free event bypass
1. Create event with `price: 0`
2. Call the same buy endpoint without payment

Expected:
- HTTP `200`
- Message `Free ticket granted`

### 7.3 Settlement hash persistence
After successful paid purchase:
1. Check response JSON includes `txHash`
2. Open `/tickets` and verify tx hash is persisted on ticket record

---

## 8) CLI Agent Workflow Tests (Pi-compatible)

All commands are non-interactive and can be run by Pi via Bash.

From `cli/`:

```bash
./buddyevents wallet setup
./buddyevents wallet fund
./buddyevents wallet balance
./buddyevents agent register --name "AgentA" --owner 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
./buddyevents events list
```

### 8.1 x402 CLI buy (critical)

```bash
./buddyevents tickets buy --event-id REPLACE_EVENT_ID
```

Expected:
- CLI performs x402 402->pay->retry flow
- Outputs:
  - `Ticket purchased!`
  - `Ticket ID: ...`
  - `Settlement Tx: 0x...`

### 8.2 Direct on-chain buy path

```bash
./buddyevents tickets buy --on-chain-id 0
```

Expected:
- `approve` tx sent
- `buyTicket` tx sent
- Success output

### 8.3 Resale flow

```bash
./buddyevents tickets sell --token-id 0 --price 15000
```

Expected:
- Ticket listed on contract marketplace
- Tx hash printed

---

## 9) Circle Wallet Integration Tests

Use these only if Circle credentials are set:
- `CIRCLE_API_KEY`
- `CIRCLE_ENTITY_SECRET_CIPHERTEXT`

### 9.1 Validate wallet set creation
Call helper in `lib/circle.ts` from a node script or app route and verify:
- wallet set id returned

### 9.2 Create Monad wallet(s)
Use `createWallets(...)` and verify:
- wallet addresses returned

### 9.3 Transfer test
Use `transferTokens(...)` and verify:
- transfer id or tx reference returned

---

## 10) Regression Checklist (Run Before Push)

- [ ] `bun run lint` passes
- [ ] `npx tsc --noEmit --skipLibCheck` passes
- [ ] `bun run build` passes
- [ ] `cd cli && go build ./...` passes
- [ ] `cd contracts && forge test` passes
- [ ] Paid x402 purchase returns real settlement tx hash
- [ ] Free event buy bypasses payment correctly
- [ ] CLI `tickets buy --event-id` works via x402
- [ ] UI create/browse/buy/tickets flows all work

---

## 11) Known Operational Notes

- x402 buy endpoint relies on:
  - Monad facilitator: `https://x402-facilitator.molandak.org`
  - Monad testnet USDC: `0x534b2f3A21130d7a60830c2Df862319e593943A3`
- If `NEXT_PUBLIC_CONVEX_URL` is missing, API routes fail fast by design.
- For reliable end-to-end buys, ensure wallet has:
  - Testnet MON (gas)
  - Testnet USDC (payment)
