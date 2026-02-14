---
name: onboarding
description: Run BuddyEvents first-time onboarding end-to-end: create Monad wallets, fund MON, create an event on-chain, subscribe/watch that event, and buy a ticket. Use when the user asks for onboarding, asks for a flow that works without project ENVs, or needs the exact CLI + cast steps to complete wallet-to-ticket setup.
---

# ONBOARDING (BuddyEvents)

Use this skill to execute a complete first-run flow with the least dependency on project ENVs.

## Choose the correct mode

- Use **No-ENV mode** by default.
- Use **API/x402 mode** only when app env, Clerk auth, and Convex service token are already configured.

## No-ENV mode (recommended default)

### What this mode requires

- `go` (build the CLI).
- `cast` (Foundry) for contract calls.
- `jq` for config and receipt parsing.
- A deployed BuddyEvents contract address on Monad testnet.
- Internet access to:
  - Monad RPC (`https://testnet-rpc.monad.xyz`)
  - MON faucet endpoint used by CLI (`https://agents.devnads.com/v1/faucet`)

No `.env.local` is required for this mode.

### Execute full onboarding

Run:

```bash
bash .cursor/skills/onboarding/scripts/onboarding_onchain.sh \
  --contract 0xYOUR_BUDDYEVENTS_CONTRACT
```

Create and link both on-chain + Convex event records in one run:

```bash
bash .cursor/skills/onboarding/scripts/onboarding_onchain.sh \
  --contract 0xYOUR_BUDDYEVENTS_CONTRACT \
  --create-convex \
  --convex-team-id YOUR_TEAM_ID
```

If `CONVEX_SERVICE_TOKEN` is not exported in shell, pass:

```bash
--convex-service-token YOUR_TOKEN
```

The script performs:

1. Build `cli/buddyevents`.
2. Create two wallets (organizer + buyer) in separate config files.
3. Request MON for both wallets.
4. Inject contract/RPC settings into both configs.
5. Create an event on-chain (`createEvent`).
6. Subscribe/watch the event by printing a live watcher command and validating event state.
7. (Optional) Create and link a matching Convex event (`events:create` + `events:setOnChainData`).
8. Buy a ticket from the buyer wallet (`tickets buy --on-chain-id`).
9. Extract ticket ID from logs and verify owner with `ownerOf`.

### Runtime notes

- There is no dedicated `subscribe` function in `contracts/src/BuddyEvents.sol`.
- Treat "subscribe to event" as:
  - continuously watching event state on-chain, and
  - registering attendance intent by buying a ticket.
- Prefer free onboarding events (`priceInUSDC=0`) to avoid requiring USDC faucet funds.

## API/x402 mode (only when env is ready)

Use this only when the user explicitly wants the off-chain/API flow and all backend prerequisites exist.

### Required env and state

- Next app running (`bun run dev`) with:
  - `NEXT_PUBLIC_CONVEX_URL`
  - `CONVEX_SERVICE_TOKEN`
  - `PAY_TO_ADDRESS`
- Clerk auth working; admin session available for event creation endpoints.
- Existing team ID (because `events create` requires `--team-id`).

### Important limitation

- `cli/buddyevents events create` calls `POST /api/events`, which requires an authenticated admin user.
- The CLI does not attach Clerk credentials by itself.
- If auth is missing, event creation returns `401` or `403`.
- If user has no ENVs or no admin session, fall back to No-ENV mode and create the event on-chain with `cast`.
- For dual-write (on-chain + Convex) without full app auth, use `--create-convex` with `--convex-team-id` and `CONVEX_SERVICE_TOKEN`.

## Quick diagnostics

- `no wallet configured`: run wallet setup for the chosen `--config`.
- `faucet error (429)`: retry later; faucet is rate-limited.
- `contract_address missing`: pass `--contract` to the onboarding script.
- `cast: command not found`: install Foundry first.
- `buy ticket failed`: ensure buyer wallet has MON for gas and event is active/not sold out.
