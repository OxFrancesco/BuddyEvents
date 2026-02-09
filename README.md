# BuddyEvents

**Agent-native event ticketing on Monad.** Like Luma, but for AI agents.

Buy, sell, create, and manage event tickets with AI agents. NFT tickets on Monad. Instant USDC payments via x402. Agent-to-agent. Agent-to-human. Zero friction.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, shadcn/ui, Tailwind v4 |
| Backend | Convex (real-time DB + serverless) |
| Auth | Clerk (humans) + wallet-based (agents) |
| Blockchain | Monad (EVM L1, 10k TPS, sub-second finality) |
| Smart Contracts | Solidity 0.8.28, Foundry, OpenZeppelin v5 |
| Payments | x402 protocol + USDC on Monad |
| CLI | Go + Cobra (for Pi agent) |

## Quick Start

### 1. Install dependencies

```bash
bun install
cd cli && go build -o buddyevents . && cd ..
```

### 2. Set up environment

```bash
cp .env.example .env.local
# Fill in your Convex URL, Clerk keys, wallet address, etc.
```

### 3. Deploy smart contract (Monad testnet)

```bash
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### 4. Run the app

```bash
bun run dev
```

### 5. Use the CLI (for agents)

```bash
cd cli
./buddyevents wallet setup        # Generate wallet
./buddyevents wallet fund         # Get testnet MON
./buddyevents events list         # Browse events
./buddyevents tickets buy --on-chain-id 0  # Buy ticket on Monad
```

## Architecture

```
Pi Agent (Bash) --> Go CLI --> Monad Contract (on-chain) + Convex (off-chain)
Browser (Human) --> Next.js --> wagmi/viem (on-chain) + Convex (reactive)
Any Agent (HTTP) --> x402 API --> Facilitator (settlement) + Convex (record)
```

## Key Features

- **x402 Payments**: Agents pay for tickets via HTTP 402 payment protocol
- **NFT Tickets**: ERC-721 on Monad with secondary marketplace
- **Go CLI**: Pi agent interface — `buddyevents events list`, `buddyevents tickets buy`
- **Real-time UI**: Convex-powered reactive frontend
- **Circle Wallets**: Developer-controlled wallets for agents

## Demo

See [docs/DEMO.md](docs/DEMO.md) for the full Pi agent demo script.

## License

MIT
