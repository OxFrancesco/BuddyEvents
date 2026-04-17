/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentRuns from "../agentRuns.js";
import type * as agents from "../agents.js";
import type * as events from "../events.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_chains from "../lib/chains.js";
import type * as lib_walletOwnership from "../lib/walletOwnership.js";
import type * as projects from "../projects.js";
import type * as qr from "../qr.js";
import type * as sponsors from "../sponsors.js";
import type * as teams from "../teams.js";
import type * as tickets from "../tickets.js";
import type * as users from "../users.js";
import type * as wallets from "../wallets.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentRuns: typeof agentRuns;
  agents: typeof agents;
  events: typeof events;
  "lib/auth": typeof lib_auth;
  "lib/chains": typeof lib_chains;
  "lib/walletOwnership": typeof lib_walletOwnership;
  projects: typeof projects;
  qr: typeof qr;
  sponsors: typeof sponsors;
  teams: typeof teams;
  tickets: typeof tickets;
  users: typeof users;
  wallets: typeof wallets;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
