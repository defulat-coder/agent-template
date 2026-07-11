import { createAgentPlatformClient } from "@agent-template/agent-client";
import { AgentRunInputSchema } from "@agent-template/shared";

export async function POST(request: Request) {
  const raw = await request.json();
  const input = AgentRunInputSchema.parse(raw);
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
  const conversationId = readConversationId(raw);
  const conversation = conversationId
    ? await client.conversations.get(conversationId, {
        signal: request.signal,
      })
    : await client.conversations.create(
        {
          title:
            input.prompt.length > 60
              ? `${input.prompt.slice(0, 57)}...`
              : input.prompt,
        },
        {
          signal: request.signal,
        },
      );
  const upstreamAbort = new AbortController();
  const abortUpstream = () => upstreamAbort.abort(request.signal.reason);
  request.signal.addEventListener("abort", abortUpstream, { once: true });
  const frames = client.conversations.send(conversation.id, input, {
    signal: upstreamAbort.signal,
  });
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const frame of frames) {
            if (frame.type === "accepted") {
              controller.enqueue(
                encoder.encode(
                  `event: run-accepted\ndata: ${JSON.stringify({
                    runId: frame.runId,
                    ...(frame.conversationId
                      ? { conversationId: frame.conversationId }
                      : {}),
                  })}\n\n`,
                ),
              );
            }
            if (frame.type === "event") {
              controller.enqueue(
                encoder.encode(
                  `event: agent-event\ndata: ${JSON.stringify(frame.event)}\n\n`,
                ),
              );
            }
            if (frame.type === "terminal") {
              controller.enqueue(
                encoder.encode(
                  `event: result\ndata: ${JSON.stringify(frame.result)}\n\n`,
                ),
              );
            }
          }
        } catch (error) {
          if (!upstreamAbort.signal.aborted) {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  message:
                    error instanceof Error
                      ? error.message
                      : "Agent chat failed",
                })}\n\n`,
              ),
            );
          }
        } finally {
          request.signal.removeEventListener("abort", abortUpstream);
          if (!upstreamAbort.signal.aborted) controller.close();
        }
      },
      cancel() {
        upstreamAbort.abort("Agent chat response cancelled");
        request.signal.removeEventListener("abort", abortUpstream);
      },
    }),
    {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

function readConversationId(input: unknown): string | undefined {
  if (
    typeof input !== "object" ||
    input === null ||
    !("conversationId" in input)
  ) {
    return undefined;
  }
  const value = input.conversationId;
  return typeof value === "string" && value.trim() ? value : undefined;
}
