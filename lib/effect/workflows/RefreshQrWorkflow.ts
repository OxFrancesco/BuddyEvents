import { Effect } from "effect";
import { api } from "@/convex/_generated/api";
import { ConvexServiceTag } from "../services/convex";
import { WorkflowPermanentError } from "../errors";
import type { RefreshQrWorkflowPayload } from "./shared";
import type { WorkflowDefinition, WorkflowRunContext } from "./registry";

type RefreshQrResult = {
  ticketQrTokenId: string;
  token: string;
  expiresAt: number;
};

export const RefreshQrWorkflow: WorkflowDefinition<
  RefreshQrWorkflowPayload,
  RefreshQrResult
> = {
  name: "refresh_qr",
  run: (context: WorkflowRunContext<RefreshQrWorkflowPayload>) =>
    Effect.gen(function* () {
      if (!context.payload.ticketId || !context.payload.eventId) {
        return yield* Effect.fail(
          new WorkflowPermanentError({
            message: "ticketId and eventId are required to refresh a QR token",
          }),
        );
      }

      const convex = yield* ConvexServiceTag;
      return yield* context.step(
        "issueQrToken",
        context.payload,
        convex.mutation<{
          ticketQrTokenId: string;
          token: string;
          expiresAt: number;
        }>(api.qr.issueForTicket, {
          ticketId: context.payload.ticketId,
          eventId: context.payload.eventId,
          userId: context.payload.userId,
          serviceToken: context.serviceToken,
        }),
        context.payload.ticketId,
      );
    }),
};
