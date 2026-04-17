import { json, type RequestHandler } from "@sveltejs/kit";
import { getWorkflow, parseJson } from "@/lib/effect/workflows";

export const GET: RequestHandler = async (event) => {
  try {
    const workflowId = event.params.id;
    if (!workflowId) {
      return json({ error: "Workflow ID is required" }, { status: 400 });
    }

    const workflow = await getWorkflow(workflowId as never);
    if (!workflow) {
      return json({ error: "Workflow not found" }, { status: 404 });
    }

    return json({
      workflow: {
        ...workflow,
        payload: parseJson(workflow.payloadJson),
        result: parseJson(workflow.resultJson),
        error: parseJson(workflow.errorJson),
      },
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch workflow",
      },
      { status: 500 },
    );
  }
};
