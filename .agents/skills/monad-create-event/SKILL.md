---
name: monad-create-event
description: "Creates events on the BuddyEvents smart contract on Monad blockchain using Foundry. Use when asked to create, deploy, or register a new event on-chain."
---

# Create Event on Monad

Creates an event on the deployed BuddyEvents contract on Monad (testnet or mainnet) using Foundry's `forge script`.

## Prerequisites

- Foundry installed (`forge` available in PATH)
- `PRIVATE_KEY` set in `.env.local` at the workspace root
- Contract deployed (address in `contracts/broadcast/Deploy.s.sol/10143/run-latest.json`)

## Workflow

1. **Gather parameters** from the user:
   - **name** (required): Event name (string)
   - **price** (optional, default `0`): Ticket price in USDC (human-readable, e.g. `10` = 10 USDC, converted to 6-decimal on-chain)
   - **maxTickets** (optional, default `100`): Maximum number of tickets

2. **Resolve the contract address** by reading `contracts/broadcast/Deploy.s.sol/10143/run-latest.json` and extracting `contractAddress` from the first transaction.

3. **Run the Foundry script**:
   ```bash
   cd contracts && source ../.env.local && \
     BUDDY_EVENTS_CONTRACT=<address> forge script \
     script/CreateEvent.s.sol:CreateEventScript \
     --rpc-url https://testnet-rpc.monad.xyz \
     --broadcast \
     --private-key "$PRIVATE_KEY"
   ```

4. **Report the result**: event ID from the logs, tx hash from the broadcast JSON.

## Script Location

The Foundry script is at `contracts/script/CreateEvent.s.sol`. It accepts these environment variables:

| Variable | Description |
|---|---|
| `BUDDY_EVENTS_CONTRACT` | Deployed contract address |
| `PRIVATE_KEY` | Deployer/organizer private key |

## Customising Parameters

To change the event name, price, or max tickets, edit the `CreateEvent.s.sol` script arguments in the `buddyEvents.createEvent(...)` call before running. The contract function signature is:

```solidity
function createEvent(string calldata name, uint256 priceInUSDC, uint256 maxTickets) external returns (uint256 eventId)
```

- `priceInUSDC` uses 6 decimals (1 USDC = 1_000_000). Pass `0` for free events.

## Network

- **Testnet**: chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`
- **Mainnet**: chain ID `143`, RPC `https://rpc.monad.xyz`
