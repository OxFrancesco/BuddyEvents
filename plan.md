# BuddyEvents — Implementation Plan

## Status: Hackathon Build

### Phase 1: Smart Contracts
- [x] BuddyEvents.sol — Event registry + ERC-721 tickets + marketplace
- [x] Deploy.s.sol — Monad testnet deploy script
- [x] BuddyEvents.t.sol — Full test suite (10/10 passing)
- [x] Foundry config — Prague EVM, Solc 0.8.28, OZ v5

### Phase 2: Convex Backend
- [x] Schema — events, tickets, teams, sponsors, agents (with indexes)
- [x] events.ts — list, get, create, edit, cancel
- [x] tickets.ts — recordPurchase, listByEvent, listByBuyer, listForSale
- [x] teams.ts — list, get, create, update
- [x] sponsors.ts — list, create
- [x] agents.ts — register, getByWallet, list

### Phase 3: x402 API Routes
- [x] /api/events/[id]/buy — x402-protected ticket purchase (Monad facilitator)
- [x] /api/events — REST CRUD for events
- [x] /api/agent — Agent registration/lookup
- [x] /api/teams — Team management
- [x] lib/x402.ts — x402 config (facilitator URL, USDC, network)
- [x] lib/monad.ts — Chain config, contract ABI, addresses
- [x] lib/wagmi.ts — Wagmi config for Monad testnet

### Phase 4: Go CLI
- [x] events list/create/cancel — via REST API
- [x] tickets buy — on-chain via Foundry cast (approve USDC + buyTicket)
- [x] tickets sell/list — marketplace + queries
- [x] wallet setup — Generate ECDSA keypair, save to config
- [x] wallet balance — JSON-RPC calls (MON + USDC)
- [x] wallet fund — Monad testnet faucet
- [x] agent register/info — via REST API
- [x] Config management — ~/.buddyevents/config.json

### Phase 5: Circle Wallet
- [x] lib/circle.ts — createWalletSet, createWallets, transfer, balance
- [x] Developer-controlled wallet API integration
- [x] .env.example with Circle API config

### Phase 6: Frontend
- [x] Landing page — Hero, features, live events grid
- [x] /events — Event listing with cards
- [x] /events/[id] — Detail page + on-chain purchase flow (approve + buy)
- [x] /create — Create event form with team auto-creation
- [x] /tickets — My tickets page with wallet connection
- [x] ConnectWallet component — Injected + WalletConnect
- [x] Web3Provider — Wagmi + TanStack Query
- [x] shadcn/ui — button, card, input, badge, dialog, etc.

### Phase 7: Demo
- [x] DEMO.md — Full Pi agent demo script
- [x] Agent A creates event, Agent B buys ticket
- [x] Web UI flow documented
- [x] x402 HTTP flow documented

## File Structure

```
BuddyEvents/
├── app/
│   ├── api/
│   │   ├── events/[id]/buy/route.ts   # x402-protected ticket purchase
│   │   ├── events/route.ts            # Event CRUD REST API
│   │   ├── agent/route.ts             # Agent registration
│   │   └── teams/route.ts             # Team management
│   ├── events/
│   │   ├── page.tsx                   # Events listing
│   │   └── [id]/page.tsx              # Event detail + buy
│   ├── create/page.tsx                # Create event form
│   ├── tickets/page.tsx               # My tickets
│   ├── layout.tsx                     # Root layout (Clerk+Convex+Wagmi)
│   ├── page.tsx                       # Landing page
│   └── globals.css
├── cli/
│   ├── cmd/
│   │   ├── root.go                    # CLI root + config
│   │   ├── events.go                  # events list|create|cancel
│   │   ├── tickets.go                 # tickets buy|sell|list
│   │   ├── wallet.go                  # wallet setup|balance|fund
│   │   └── agent.go                   # agent register|info
│   ├── internal/
│   │   ├── api/client.go              # HTTP client for REST API
│   │   └── config/config.go           # Config management
│   ├── main.go
│   └── go.mod
├── components/
│   ├── ui/                            # shadcn/ui components
│   ├── ConvexClientProvider.tsx
│   ├── Web3Provider.tsx
│   ├── ConnectWallet.tsx
│   └── EventCard.tsx
├── contracts/
│   ├── src/BuddyEvents.sol            # Event registry + ERC-721 + marketplace
│   ├── script/Deploy.s.sol
│   ├── test/BuddyEvents.t.sol         # 10 tests passing
│   ├── foundry.toml
│   └── remappings.txt
├── convex/
│   ├── schema.ts                      # Full data model
│   ├── events.ts                      # Event CRUD
│   ├── tickets.ts                     # Ticket management
│   ├── teams.ts                       # Team CRUD
│   ├── sponsors.ts                    # Sponsor management
│   └── agents.ts                      # Agent registration
├── lib/
│   ├── monad.ts                       # Chain config + contract ABI
│   ├── x402.ts                        # x402 config
│   ├── wagmi.ts                       # Wagmi config
│   ├── circle.ts                      # Circle Wallet SDK
│   └── utils.ts                       # shadcn utils
├── docs/
│   ├── PRD.md
│   ├── MONAD.md
│   ├── MONADOCS.md
│   ├── CIRCLEWALLET.md
│   └── DEMO.md                        # Demo script
├── .env.example
├── package.json
└── plan.md                            # This file
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, shadcn/ui, Tailwind v4 |
| Backend | Convex (real-time DB + serverless functions) |
| Auth | Clerk (humans) + wallet-based (agents) |
| Blockchain | Monad (EVM L1, Prague fork) |
| Smart Contracts | Solidity 0.8.28, Foundry, OpenZeppelin v5 |
| Payments | x402 protocol + USDC on Monad |
| Wallet | wagmi/viem (frontend) + Circle Wallet SDK |
| CLI | Go + Cobra + Foundry cast |
| Agent | Pi (pi-mono) via Bash tool |
