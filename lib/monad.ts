/// lib/monad.ts — Monad chain configuration and contract constants

import { monadTestnet } from "viem/chains";

// Re-export for convenience
export { monadTestnet };

// Contract addresses (update after deployment)
export const BUDDY_EVENTS_ADDRESS =
  (process.env.NEXT_PUBLIC_BUDDY_EVENTS_CONTRACT as `0x${string}`) ??
  ("0x0000000000000000000000000000000000000000" as const);

// Monad Testnet USDC (Circle)
export const MONAD_USDC_TESTNET =
  "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;

// Network identifiers
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_CAIP2 = "eip155:10143" as const;
export const MONAD_MAINNET_CAIP2 = "eip155:143" as const;

// RPC
export const MONAD_TESTNET_RPC = "https://testnet-rpc.monad.xyz";
export const MONAD_MAINNET_RPC = "https://rpc.monad.xyz";

// BuddyEvents contract ABI (subset for frontend use)
export const BUDDY_EVENTS_ABI = [
  {
    type: "function",
    name: "createEvent",
    inputs: [
      { name: "name", type: "string" },
      { name: "priceInUSDC", type: "uint256" },
      { name: "maxTickets", type: "uint256" },
    ],
    outputs: [{ name: "eventId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "editEvent",
    inputs: [
      { name: "eventId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "priceInUSDC", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "buyTicket",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "listTicket",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "buyListedTicket",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelEvent",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getEvent",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "priceInUSDC", type: "uint256" },
      { name: "maxTickets", type: "uint256" },
      { name: "ticketsSold", type: "uint256" },
      { name: "organizer", type: "address" },
      { name: "active", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getListing",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "seller", type: "address" },
      { name: "active", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextEventId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextTicketId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ERC20 ABI for USDC approve
export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
