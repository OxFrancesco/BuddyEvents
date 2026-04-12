# BuddyEvents

Agent-native event ticketing on Monad.

BuddyEvents combines:
- On-chain ticketing (ERC-721 on Monad)
- Real-time app state (Convex)
- Human auth (Clerk + wallet)
- Agent payments (x402 + CLI)
- Telegram bot + Mini App agent flows
- Optional Circle developer-controlled wallets

## TL;DR

BuddyEvents is an event platform where both humans and AI agents can discover events, buy tickets, and validate entry.

What you can do right now:
- Browse approved events by Foundation and Project (`/events`)
- Submit events with moderation workflows (`/create`, `/admin/events`)
- Buy tickets directly on Monad from the web app (`/events/[id]`)
- Buy tickets via x402-protected API (`GET /api/events/:id/buy`)
- Manage tickets and QR entry passes (`/tickets`)
- Run organizer/admin check-ins (`/check-in`, `/admin/checkin`)
- Use PI agent commands via Telegram and HTTP (`/api/pi/*`, `/api/telegram/*`)
- Use the Effect TypeScript CLI for wallet ops, event discovery, buying, reconciliation, and agent registration (`bun run cli -- ...`)
- Run the durable workflow worker (`bun run worker`)

Core stack:
- Frontend: Next.js 16 + React 19 + Tailwind + shadcn/ui
- Backend: Convex (queries, mutations, auth-guarded logic)
- Auth: Clerk + wallet-linked profiles
- Chain: Monad testnet/mainnet-compatible EVM flows
- Contract: `contracts/src/BuddyEvents.sol` (ERC-721 tickets + secondary listings)
- Agent payments: x402 (`/api/events/[id]/buy`)

---

## Technical Analysis

### 1. Product Architecture

BuddyEvents has two parallel execution paths:

1. Human flow:
- UI in Next.js pages
- Clerk session + wallet connect
- Direct wallet transactions (approve USDC + `buyTicket`) via wagmi/viem
- Off-chain ticket + QR issuance in Convex after on-chain confirmation

2. Agent flow:
- Effect CLI or Telegram command
- API endpoints under `/api/*`
- x402 challenge/settlement for paid HTTP purchases
- Convex-backed workflow execution journal (`workflowExecutions`, `workflowSteps`, `workflowSignals`)
- Circle wallet automation for PI workflows (optional)
- Agent run telemetry in Convex (`agentRuns`)

### 2. Data Model (Convex)

Main tables in `convex/schema.ts`:
- `events`: lifecycle (`draft|active|ended|cancelled`), moderation (`pending|approved|rejected`), optional foundation/project assignment, on-chain event linkage.
- `tickets`: owner, purchase tx hash, durable purchase reference/source, status (`active|listed|transferred|refunded`), QR payload, check-in metadata.
- `ticketQrTokens`: hashed short-lived QR tokens, active plaintext mirror for rendering, expiry, revocation.
- `eventCheckins`: immutable check-in records.
- `teams`: foundation-level organizer groups and wallets.
- `projects`: optional project grouping under foundations.
- `users`: Clerk identity, wallet link, Telegram link, role (`user|admin`).
- `agents`: registered AI agents with owner wallet.
- `agentRuns`: execution logs for PI actions.
- `wallets`: Circle wallet mapping per user.
- `sponsors`: sponsor metadata.
- `workflowExecutions`: durable workflow leases, status, retry state, payload, and results.
- `workflowSteps`: step-level journal entries with external references.
- `workflowSignals`: future-proof signal channel for workflow coordination and reconciliation.

### 3. Authorization and Security Model

Auth/role checks are centralized in `convex/lib/auth.ts` and enforced in route handlers + Convex functions.

Mechanisms:
- Clerk-authenticated user identity for human routes.
- Convex service-token (`CONVEX_SERVICE_TOKEN`) for trusted server-side calls.
- Admin-only mutations for sensitive ops (team/project create, moderation, role changes, protected ticket views).

Route protection in `proxy.ts`:
- Protected UI paths: `/create`, `/tickets`, `/check-in`, `/admin/*`.
- API routes still run middleware; endpoint handlers enforce auth/roles explicitly.

### 4. Event Lifecycle and Moderation

#### Submission
- Non-admin and unassigned submissions create `draft + pending` events.
- Admin submissions with assignment can auto-publish to `active + approved`.

#### Moderation
- `/admin/events` lists pending submissions.
- Admin can:
  - Approve with foundation/project assignment and notes
  - Reject with notes

Backing logic lives in:
- `convex/events.ts`: `submit`, `listPendingSubmissions`, `approveSubmission`, `rejectSubmission`.

### 5. Ticket Purchase Paths

#### A. Web on-chain purchase
Path: `/events/[id]`

Flow:
1. Ensure wallet connected + Clerk signed in
2. Ensure Monad testnet chain selected
3. If paid event: call USDC `approve` first
4. Call `BuddyEvents.buyTicket(onChainEventId)`
5. Auto-sync via `POST /api/purchases/confirm`, which starts a durable `ticket_purchase` workflow
6. Background reconciliation replays the workflow if the browser disappears mid-flight

Result:
- Ticket stored in Convex exactly once
- `ticketsSold` incremented exactly once
- Tokenized QR issued from `ticketQrTokens`

#### B. Agent/API purchase with x402
Path: `GET /api/events/[id]/buy`

Behavior:
- Endpoint is x402-protected (`@x402/core/server`, `ExactEvmScheme`)
- Price is dynamic per event
- Payee is dynamic: team wallet if assigned, else fallback `PAY_TO_ADDRESS`
- Free events skip payment challenge and enqueue the same durable fulfillment workflow
- Successful settlement creates ticket + QR in Convex via an idempotent `purchaseReference`

### 6. Check-in System

There are two check-in paths currently:

1. Organizer check-in (`/check-in`)
- Uses `tickets.scanForCheckIn`
- Validates organizer authorization via:
  - Admin role, or
  - Event creator wallet, or
  - Team wallet/member match

2. Admin tokenized check-in (`/admin/checkin`)
- Uses `qr.validateAndCheckIn`
- Validates hashed QR token, expiry/revocation, duplicate entry
- Writes immutable record to `eventCheckins`

### 7. Telegram + PI Agent Runtime

#### Telegram bot webhook
`POST /api/telegram/webhook`
- Supports commands:
  - `/events`
  - `/tickets`
  - `/wallet`
  - `/buy <eventId>`
  - `/qr <ticketId>`
  - `/help`
- Read-only commands execute inline
- Mutating commands enqueue durable workflows and reply immediately with a processing status
- Completion and failure messages are sent by workflow steps

#### Telegram Mini App auth
`POST /api/telegram/auth/start`
- Verifies signed Telegram `initData`
- Upserts Telegram↔Clerk user link
- Issues Clerk sign-in ticket for Mini App session

#### PI execution engine
`lib/piAgent.ts`
- Intents:
  - `find_events`
  - `find_tickets`
  - `connect_wallet`
  - `buy_ticket`
  - `create_event` (admin-only)
  - `get_event_qr`
- Persists run start/finish + status in `agentRuns`

### 8. Circle Wallet Integration (Optional)

`lib/circle.ts` provides:
- Wallet set/wallet creation
- Balance fetch
- Token transfer
- Contract execution tx creation

Used by PI endpoints for:
- wallet connect (`/api/pi/wallet/connect`)
- balance (`/api/pi/wallet/balance`)
- buy/create actions through Circle-managed wallet signatures
- admin event creation through durable `create_event` workflow reconciliation

### 9. Smart Contract Capabilities

`contracts/src/BuddyEvents.sol` includes:
- Event creation/edit/cancel
- Ticket purchase with USDC transfer to organizer
- ERC-721 ticket minting
- Secondary market listing/delisting/buying
- Auto-delist on ownership transfer

Contract test coverage (`contracts/test/BuddyEvents.t.sol`) includes:
- event CRUD constraints
- sold-out/cancelled reverts
- price-lock after first sale
- listing and transfer behaviors

### 10. CLI Capabilities

Effect TypeScript CLI (`tools/cli/main.ts`, invoked with `bun run cli -- ...`) commands:
- `wallet`
  - `setup`: generate wallet and persist config
  - `fund`: faucet request for MON
  - `balance`: MON + USDC checks
  - `send`: send MON/USDC
- `events`
  - `list`
  - `create`
  - `cancel`
- `tickets`
  - `list`
  - `buy`:
    - direct on-chain via `cast` (`--on-chain-id`)
    - x402 API (`--event-id`)
  - `sell` (list ticket on-chain)
- `agent`
  - `register`
  - `info`
- `workflow`
  - `list`
  - `get`
  - `retry`
  - `sweep`
- `reconcile`
  - `purchases`
  - `events`
  - `wallets`
- `tui`: OpenTUI workflow dashboard

The previous Go implementation is preserved in `legacy/go-cli/` during the migration.

---

## User Flow (All Features)

### A. Human user: browse and buy from web

1. Open `/`
- See hero, feature highlights, and recent active events.

2. Go to `/events`
- Events are grouped into:
  - Foundation Events
  - Project Events
- Only approved events are shown.

3. Open an event `/events/:id`
- See event details, availability, team info.
- If wallet not on Monad testnet, switch chain.
- Approve USDC (if paid) and buy.

4. Purchase auto-finalizes
- After on-chain confirmation, the page posts to `/api/purchases/confirm`.
- Ticket fulfillment runs through the durable workflow engine and auto-heals on retry.

5. Go to `/tickets`
- View all owned tickets.
- View QR for entry.

### B. Human user: submit an event

1. Go to `/create` (auth required)
2. Choose destination:
- Foundation
- Project
- Unassigned (admin queue)
3. Submit event details
4. Outcome:
- Admin with assignment: auto-published
- Otherwise: pending moderation

### C. Admin moderation flow

1. Go to `/admin/events`
2. Review pending submissions
3. Choose foundation/project assignment
4. Approve or reject with moderation notes

### D. Organizer/event staff check-in flow

1. Go to `/check-in`
2. Paste/scan QR value
3. System validates:
- Ticket exists
- Event active
- Organizer authorized
- Ticket not previously checked in
4. Ticket is marked checked-in

### E. Admin check-in flow (tokenized QR)

1. Go to `/admin/checkin`
2. Paste tokenized QR payload (`be_qr_...`)
3. System validates token hash, expiry, and duplicate use
4. Check-in record persisted in `eventCheckins`

### F. Agent flow via HTTP (x402)

1. Agent requests `GET /api/events/:id/buy?buyer=0x...`
2. For paid events, server returns payment challenge (HTTP 402)
3. Agent signs and retries with payment payload
4. Server settles via facilitator and issues ticket
5. Response returns `ticketId`, `qrCode`, settlement `txHash`

### G. Agent flow via Telegram bot

1. User messages bot `/start`
2. Bot returns command guide + Mini App button
3. Commands:
- `/events` list active approved events
- `/tickets` list user tickets
- `/wallet` connect/get Circle wallet
- `/buy <eventId>` purchase ticket
- `/qr <ticketId>` issue QR token for owned ticket
- `/help` show command guide + tips

### H. Agent flow via Telegram Mini App

1. Open `/telegram` from Telegram WebApp
2. Mini App verifies Telegram initData and signs into Clerk
3. Use quick actions or command box to run PI intents
4. Optionally connect Circle wallet and inspect balances
5. Generate QR token for owned ticket IDs

### I. CLI-first agent/operator flow

1. `bun run cli -- wallet setup`
2. `bun run cli -- wallet fund`
3. `bun run cli -- events list`
4. `bun run cli -- tickets buy --event-id <convexId>` (x402)
5. or `bun run cli -- tickets buy --event-id <convexId> --on-chain-id <id>` (direct contract + durable confirm)
6. `bun run cli -- tickets list`
7. `bun run cli -- agent register --name ... --owner ...`

---

## API Surface (Implemented)

### Public-ish read endpoints
- `GET /api/events`
- `GET /api/teams`
- `GET /api/agent?wallet=...`

### Auth/Admin protected endpoints
- `POST /api/events` (admin create/cancel)
- `POST /api/teams` (admin)
- `POST /api/agent` (owner/admin)
- `POST /api/tickets/scan` (signed-in organizer/admin)
- `POST /api/checkin/validate` (admin)
- `POST /api/purchases/confirm`

### x402 purchase endpoint
- `GET /api/events/[id]/buy`

### Workflow introspection
- `GET /api/workflows/[id]`

### PI + Telegram endpoints
- `POST /api/pi/execute`
- `POST /api/pi/events/create` (admin)
- `GET /api/pi/qr` (owner/admin)
- `POST /api/pi/wallet/connect`
- `GET /api/pi/wallet/balance`
- `POST /api/telegram/webhook`
- `POST /api/telegram/auth/start`

---

## Feature Matrix

Web app:
- Landing page with active events preview
- Foundation/project event feeds
- Event details + on-chain purchase
- Ticket wallet view + QR rendering
- Event submission + moderation queue
- Organizer and admin check-in UIs
- Telegram Mini App command console

Backend/API:
- Event/team/agent CRUD paths
- Ticket issue, lookup, check-in
- x402 payment negotiation + settlement gating
- Telegram webhook command handling
- PI intent execution orchestration

Agent/CLI:
- Wallet ops + funding + token transfer
- Event discovery and management
- Ticket buy (direct and x402)
- Agent registration and lookup
- Workflow inspection and retry
- Purchase/event/wallet reconciliation

On-chain:
- Event registry
- NFT ticket minting
- USDC-based purchases
- Secondary listing and resale primitives

---

## Setup

### 1. Install dependencies

```bash
bun install
bun run test
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Required baseline:
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `CONVEX_SERVICE_TOKEN`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `ADMIN_BOOTSTRAP_TOKEN`
- `NEXT_PUBLIC_BUDDY_EVENTS_CONTRACT`
- `NEXT_PUBLIC_WC_PROJECT_ID`
- `PAY_TO_ADDRESS`

Optional features:
- Circle: `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET_CIPHERTEXT`, `CIRCLE_WALLET_SET_ID`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TELEGRAM_MINIAPP_URL`, `NEXT_PUBLIC_APP_URL`
- PI natural language intents/replies (optional): `OPENROUTER_API_KEY` (plus optional `OPENROUTER_MODEL`, `OPENROUTER_REPLY_MODEL`, `OPENROUTER_ROUTER_MODEL`, `OPENROUTER_APP_NAME`, `PI_INTENT_TIMEOUT_MS`, `PI_TELEGRAM_LLM_ROUTER`, `PI_TELEGRAM_ROUTER_TIMEOUT_MS`, `PI_TELEGRAM_LLM_REPLIES`, `PI_TELEGRAM_REPLY_TIMEOUT_MS`)

### 3. Bootstrap first admin

```bash
npx convex run users:bootstrapAdmin '{"clerkId":"<clerk_user_id>","bootstrapToken":"<ADMIN_BOOTSTRAP_TOKEN>"}'
```

### 4. Deploy contract

```bash
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Set deployed address in:
- `.env.local` -> `NEXT_PUBLIC_BUDDY_EVENTS_CONTRACT`
- `~/.buddyevents/config.json` -> `contractAddress` (for CLI usage)

### 5. Run app

```bash
bun run dev
```

### 6. Run the workflow worker

```bash
bun run worker
```

### 7. (Optional) Register Telegram webhook

```bash
./scripts/telegram/set-webhook.sh
./scripts/telegram/get-webhook.sh
```

---

## Known Implementation Notes

- Secondary-market UI is not exposed in the web frontend yet; contract + CLI support exists.
- Web purchase flow now auto-syncs after on-chain confirmation through `/api/purchases/confirm`.
- Durable retries require the worker process to be running in non-request execution paths.
- Two check-in paths coexist:
  - legacy organizer scan (`tickets.scanForCheckIn`)
  - tokenized admin validation (`qr.validateAndCheckIn`)

---

## Project Structure

```text
app/                 Next.js pages + API routes
components/          UI components/providers
convex/              Backend functions + schema + auth guards
contracts/           Solidity contract + tests + deploy scripts
legacy/go-cli/       Preserved Go CLI during the migration window
docs/                Additional runbooks and references
lib/                 Chain, x402, Telegram, PI, Circle helpers
tools/cli/           Effect CLI entrypoint and config helpers
tools/worker/        Durable workflow worker
scripts/telegram/    Telegram webhook helper scripts
```

---

## License

MIT
