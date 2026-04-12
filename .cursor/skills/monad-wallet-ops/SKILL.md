---
name: monad-wallet-ops
description: Operates BuddyEvents Monad testnet wallets and on-chain event lifecycle via CLI and Foundry cast. Use when the user asks to create, fund, inspect, or send from agent wallets, OR to create events on-chain, buy tickets, or list tickets for resale.
---

# Monad Wallet & Event Ops (BuddyEvents CLI)

## Context

This skill manages agent wallets and the on-chain event lifecycle for this repo using `cli/buddyevents` and Foundry's `cast` on Monad testnet (`chainId 10143`).

Primary capabilities:
- **Wallet**: `wallet setup`, `wallet fund`, `wallet balance`, `wallet send`
- **Events**: `events create` (API), on-chain `createEvent` (cast), `events list`, `events cancel`
- **Tickets**: `tickets buy` (on-chain or x402), `tickets sell`, `tickets list`

Key config file: `~/.buddyevents/config.json`  
Key fields: `private_key`, `wallet_address`, `contract_address`, `usdc_address`, `monad_rpc`, `api_url`

## Workflow

Copy this checklist and execute in order:

```text
Full Event Lifecycle Checklist
- [ ] Build CLI
- [ ] Create wallet (or confirm existing)
- [ ] Fund MON from faucet
- [ ] Fund USDC from Circle faucet
- [ ] Check MON + USDC balances
- [ ] Create event (API and/or on-chain)
- [ ] Buy ticket (on-chain or x402)
- [ ] Verify ticket ownership
```

---

## Part A — Wallet Commands

Run from `cli/` after building.

### 1) Build CLI

```bash
cd cli
go build -o buddyevents .
```

### 2) Create wallet

```bash
./buddyevents wallet setup
```

Behavior:
- Generates ECDSA private key
- Stores wallet in `~/.buddyevents/config.json`
- Prints wallet address and private key

### 3) Fund testnet MON

```bash
./buddyevents wallet fund
```

Notes:
- Uses Monad agent faucet API with `chainId: 10143`
- For USDC, use Circle faucet manually: `https://faucet.circle.com` (select Monad Testnet)

### 4) Check balances

```bash
./buddyevents wallet balance
```

Outputs:
- `MON` (native)
- `USDC` (ERC-20 at configured `usdc_address`)

### 5) Send funds

Send MON:

```bash
./buddyevents wallet send --token mon --to 0xRECIPIENT --amount 0.01
```

Send USDC:

```bash
./buddyevents wallet send --token usdc --to 0xRECIPIENT --amount 1.5
```

---

## Part B — Event Creation

### B1) Create event via API (Convex backend)

```bash
./buddyevents events create \
  --name "Francesco's Participation" \
  --description "Exclusive event" \
  --start 1765000000000 \
  --end 1765007200000 \
  --price 0.01 \
  --max-tickets 50 \
  --team-id REPLACE_TEAM_ID \
  --location "SF"
```

Required flags: `--name`, `--start`, `--end`, `--team-id`  
Optional: `--description`, `--price` (default 0), `--max-tickets` (default 100), `--location`, `--creator` (defaults to config wallet)

Output: `Event created: <eventId>`

### B2) Create event on-chain via cast

Uses the `BuddyEvents.createEvent(string name, uint256 priceInUSDC, uint256 maxTickets)` contract function.

```bash
PRIVATE_KEY=$(jq -r '.private_key' ~/.buddyevents/config.json)
CONTRACT=$(jq -r '.contract_address' ~/.buddyevents/config.json)
RPC=https://testnet-rpc.monad.xyz

cast send --rpc-url "$RPC" \
  --private-key "$PRIVATE_KEY" \
  "$CONTRACT" \
  "createEvent(string,uint256,uint256)" \
  "Francesco's Participation" \
  10000000 \
  50
```

Parameters:
- `name` — event name string
- `priceInUSDC` — price in USDC smallest units (6 decimals: `10000000` = 10 USDC, `0` = free)
- `maxTickets` — max ticket supply

Output: transaction hash. Parse `EventCreated` log to get the `eventId`:

```bash
cast receipt --rpc-url "$RPC" <TX_HASH> --json | \
  jq '.logs[0].topics[1]' | xargs cast --to-dec
```

### B3) Verify on-chain event was created

```bash
cast call --rpc-url "$RPC" \
  "$CONTRACT" \
  "getEvent(uint256)(string,uint256,uint256,uint256,address,bool)" \
  <EVENT_ID>
```

Output: `(name, priceInUSDC, maxTickets, ticketsSold, organizer, active)`

### B4) List events via API

```bash
./buddyevents events list --status active
```

---

## Part C — Ticket Purchase

### C1) Buy ticket on-chain (direct contract call)

```bash
./buddyevents tickets buy --on-chain-id <EVENT_ID>
```

This runs:
1. `cast call getEvent()` to read price
2. `cast send approve()` USDC to contract
3. `cast send buyTicket()` on the contract

### C2) Buy ticket via x402 API flow

```bash
./buddyevents tickets buy --event-id <CONVEX_EVENT_ID>
```

This performs the 402 → pay → retry flow automatically.

### C3) List ticket for resale

```bash
./buddyevents tickets sell --token-id <TOKEN_ID> --price <PRICE_USDC_UNITS>
```

### C4) List owned tickets

```bash
./buddyevents tickets list
./buddyevents tickets list --event-id <EVENT_ID>
```

---

## Troubleshooting

- `no wallet configured`  
  Run `./buddyevents wallet setup`.

- `faucet error (429)` or similar  
  Faucet rate-limited. Retry later or use `https://faucet.monad.xyz`.

- `RPC error` on balance/send  
  Check `MonadRPC` in `~/.buddyevents/config.json` (expected `https://testnet-rpc.monad.xyz`).

- `invalid --to address`  
  Use a checksummed or valid `0x...` EVM address.

- `Empty name` / `Zero tickets` on `createEvent`  
  Contract requires non-empty name and maxTickets > 0.

- `Not organizer` on `editEvent` / `cancelEvent`  
  Only the address that created the event on-chain can modify it.

- `USDC transfer failed` on `buyTicket`  
  Ensure wallet has sufficient USDC balance and has approved the contract.

## Safety

- Never paste private keys in chat or logs.
- `wallet setup` overwrites current configured wallet in `~/.buddyevents/config.json`.
- Confirm recipient address and amount before `wallet send`.
- On-chain events are immutable once tickets are sold (price cannot change).
- Always verify `contract_address` in config matches the deployed contract before sending transactions.
