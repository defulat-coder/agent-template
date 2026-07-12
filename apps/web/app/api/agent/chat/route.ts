import { AgentRunInputSchema } from "@agent-template/shared";
import {
  createServerAgentClient,
  createServerAgentErrorResponse,
  describeServerAgentError,
  linkAbortSignal,
} from "@/lib/server-agent-client";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const input = AgentRunInputSchema.parse(raw);
    const client = createServerAgentClient();
    const upstreamAbort = new AbortController();
    const removeRequestAbort = linkAbortSignal(request.signal, upstreamAbort);
    const conversationId = readConversationId(raw);
    try {
      const conversation = conversationId
        ? await client.conversations.get(conversationId, {
            signal: upstreamAbort.signal,
          })
        : await client.conversations.create(
            { title: toConversationTitle(input.prompt) },
            { signal: upstreamAbort.signal },
          );
      const frames = client.conversations.send(conversation.id, input, {
        signal: upstreamAbort.signal,
      });
      const encoder = new TextEncoder();

      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              for await (const frame of frames) {
                controller.enqueue(encoder.encode(encodeSse("frame", frame)));
              }
            } catch (error) {
              if (!upstreamAbort.signal.aborted) {
                const { envelope } = describeServerAgentError(error);
                controller.enqueue(
                  encoder.encode(encodeSse("error", envelope)),
                );
              }
            } finally {
              removeRequestAbort();
              if (!upstreamAbort.signal.aborted) controller.close();
            }
          },
          cancel() {
            upstreamAbort.abort("Agent chat response cancelled");
            removeRequestAbort();
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
    } catch (error) {
      removeRequestAbort();
      throw error;
    }
  } catch (error) {
    return createServerAgentErrorResponse(error);
  }
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
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toConversationTitle(prompt: string): string {
  return prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;
}

function encodeSse(event: "error" | "frame", value: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
}
