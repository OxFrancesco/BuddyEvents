import { Effect } from "effect";
import { DEFAULT_CHAIN_KEY } from "@/lib/chains";
import { WorkflowPermanentError } from "../errors";
import { CrossmintServiceTag } from "../services/crossmint";
import type { ProvisionWalletWorkflowPayload } from "./shared";
import type { WorkflowDefinition, WorkflowRunContext } from "./registry";

type ProvisionCircleWalletResult = {
  walletId: string;
  walletAddress: string;
  chainKey: string;
  blockchain: string;
};

export const ProvisionCircleWalletWorkflow: WorkflowDefinition<
  ProvisionWalletWorkflowPayload,
  ProvisionCircleWalletResult
> = {
  name: "provision_circle_wallet",
  run: (context: WorkflowRunContext<ProvisionWalletWorkflowPayload>) =>
    Effect.gen(function* () {
      if (!context.payload.userId) {
        return yield* Effect.fail(
          new WorkflowPermanentError({
            message: "userId is required to provision a wallet",
          }),
        );
      }

      const crossmint = yield* CrossmintServiceTag;
      const chainKey = context.payload.chainKey ?? DEFAULT_CHAIN_KEY;
      const purpose = context.payload.purpose ?? "automation";
      return yield* context.step(
        "ensureWallet",
        { ...context.payload, chainKey, purpose },
        crossmint.ensureUserWallet(context.payload.userId, purpose),
        `${context.payload.userId}:${purpose}:${chainKey}`,
      );
    }),
};
