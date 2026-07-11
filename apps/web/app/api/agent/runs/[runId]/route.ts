import { createAgentPlatformClient } from "@agent-template/agent-client";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const client = createAgentPlatformClient({
    baseUrl:
      process.env.AGENT_API_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:14000",
    ...((process.env.AGENT_TEMPLATE_TOKEN ?? process.env.AGENT_API_TOKEN)
      ? {
          token:
            process.env.AGENT_TEMPLATE_TOKEN ?? process.env.AGENT_API_TOKEN,
        }
      : {}),
  });

  return Response.json(await client.runs.cancel(runId));
}
