import { NextResponse } from "next/server";
import { getWorkflow, parseJson } from "../../../../lib/effect/workflows";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const workflow = await getWorkflow(id as never);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({
      workflow: {
        ...workflow,
        payload: parseJson(workflow.payloadJson),
        result: parseJson(workflow.resultJson),
        error: parseJson(workflow.errorJson),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch workflow",
      },
      { status: 500 },
    );
  }
}
