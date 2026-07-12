import {
  createServerAgentClient,
  createServerAgentErrorResponse,
} from "@/lib/server-agent-client";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await context.params;
    const client = createServerAgentClient();
    return Response.json(await client.runs.cancel(runId));
  } catch (error) {
    return createServerAgentErrorResponse(error);
  }
}
