import { ManagedRuntime, Layer } from "effect";
import { NodeContext } from "@effect/platform-node";
import { AppConfigLayer } from "./config";
import { consoleLayer, prettyLoggerLayer } from "./logging";
import { CrossmintServiceLayer } from "./services/crossmint";
import { CircleServiceLayer } from "./services/circle";
import { ConvexServiceLayer } from "./services/convex";
import { EvmServiceLayer } from "./services/evm";
import { OpenRouterServiceLayer } from "./services/openrouter";
import { TelegramServiceLayer } from "./services/telegram";
import { X402ServiceLayer } from "./services/x402";

const baseLayer = Layer.mergeAll(
  NodeContext.layer,
  AppConfigLayer,
  consoleLayer,
  prettyLoggerLayer,
);

const convexLayer = Layer.provide(ConvexServiceLayer, baseLayer);
const circleLayer = Layer.provide(
  CircleServiceLayer,
  Layer.mergeAll(baseLayer, convexLayer),
);
const crossmintLayer = Layer.provide(
  CrossmintServiceLayer,
  Layer.mergeAll(baseLayer, convexLayer),
);
const evmLayer = Layer.provide(EvmServiceLayer, baseLayer);
const openRouterLayer = Layer.provide(OpenRouterServiceLayer, baseLayer);
const x402Layer = Layer.provide(X402ServiceLayer, baseLayer);

export const AppLayer = Layer.mergeAll(
  baseLayer,
  convexLayer,
  circleLayer,
  crossmintLayer,
  evmLayer,
  openRouterLayer,
  TelegramServiceLayer,
  x402Layer,
);

export const AppRuntime = ManagedRuntime.make(AppLayer);
