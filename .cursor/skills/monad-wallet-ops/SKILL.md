---
name: monad-wallet-ops
description: Operates BuddyEvents Monad testnet wallets via CLI for setup, faucet funding, balance checks, and transfers. Use when the user asks to create, fund, inspect, or send from agent wallets.
---

# Monad Wallet Ops (BuddyEvents CLI)

## Context

This skill manages agent wallets for this repo using `cli/buddyevents` on Monad testnet (`chainId 10143`).

Primary commands:
- `wallet setup`
- `wallet fund`
- `wallet balance`
- `wallet send`

## Workflow

Copy this checklist and execute in order:

```text
Wallet Ops Checklist
- [ ] Build CLI
- [ ] Create wallet (or confirm existing)
- [ ] Fund MON from faucet
- [ ] Check MON + USDC balances
- [ ] Send MON/USDC if requested
```

## Commands

Run from project root unless specified.

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

## Troubleshooting

- `no wallet configured`  
  Run `./buddyevents wallet setup`.

- `faucet error (429)` or similar  
  Faucet rate-limited. Retry later or use `https://faucet.monad.xyz`.

- `RPC error` on balance/send  
  Check `MonadRPC` in `~/.buddyevents/config.json` (expected `https://testnet-rpc.monad.xyz`).

- `invalid --to address`  
  Use a checksummed or valid `0x...` EVM address.

## Safety

- Never paste private keys in chat or logs.
- `wallet setup` overwrites current configured wallet in `~/.buddyevents/config.json`.
- Confirm recipient address and amount before `wallet send`.
