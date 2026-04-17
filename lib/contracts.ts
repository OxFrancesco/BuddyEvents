/// lib/contracts.ts — Chain-agnostic contract ABIs used across frontend and services

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
  {
    type: "event",
    name: "EventCreated",
    inputs: [
      { name: "eventId", type: "uint256", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "price", type: "uint256", indexed: false },
      { name: "maxTickets", type: "uint256", indexed: false },
      { name: "organizer", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TicketPurchased",
    inputs: [
      { name: "eventId", type: "uint256", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

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
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
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
