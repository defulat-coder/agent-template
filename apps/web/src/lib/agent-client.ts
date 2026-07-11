import {
  AgentJobAcceptedSchema,
  AgentRunResultSchema,
  AgentRunEventSchema,
  AgentRunSnapshotSchema,
  maxAgentSseBufferCharacters,
  type AgentInputResponse,
  type AgentJobAccepted,
  type AgentRunEvent,
  type AgentRunResult,
  type AgentRunSnapshot,
} from "@agent-template/shared";
import { z } from "zod";

export type { AgentJobAccepted };

type SubmitAgentJobOptions = {
  prompt: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

type StreamAgentChatOptions = SubmitAgentJobOptions & {
  conversationId?: string;
  inputResponses?: AgentInputResponse[];
  onAccepted?: (input: { runId: string; conversationId?: string }) => void;
  onEvent?: (event: AgentRunEvent) => void;
  signal?: AbortSignal;
};

export async function submitAgentJob({
  prompt,
  baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:14000",
  fetcher = fetch,
}: SubmitAgentJobOptions): Promise<AgentJobAccepted> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error("Prompt is required");
  }

  let response: Response;

  try {
    response = await fetcher(`${baseUrl}/agent/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: trimmedPrompt,
        requestedAt: new Date().toISOString(),
      }),
    });
  } catch {
    throw new Error("Unable to reach Agent job intake API");
  }

  if (!response.ok) {
    throw new Error(
      `Agent job intake rejected the request with status ${response.status}`,
    );
  }

  return AgentJobAcceptedSchema.parse(await response.json());
}

export async function streamAgentChat({
  conversationId,
  inputResponses,
  prompt,
  baseUrl = "/api",
  fetcher = fetch,
  onEvent,
  onAccepted,
  signal,
}: StreamAgentChatOptions): Promise<AgentRunResult> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error("Prompt is required");
  }

  let response: Response;

  try {
    response = await fetcher(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: trimmedPrompt,
        ...(conversationId ? { conversationId } : {}),
        ...(inputResponses?.length ? { inputResponses } : {}),
      }),
      ...(signal ? { signal } : {}),
    });
  } catch {
    if (signal?.aborted) throw new Error("Agent chat cancelled");
    throw new Error("Unable to reach Agent chat API");
  }

  if (!response.ok) {
    throw new Error(
      `Agent chat rejected the request with status ${response.status}`,
    );
  }

  if (!response.body) {
    throw new Error("Agent chat API did not return a stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AgentRunResult | undefined;
  let streamEnded = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = readSseMessages(buffer, (message) => {
        const event = parseSseMessage(message);

        if (event.type === "run-accepted") {
          onAccepted?.(event.data);
        } else if (event.type === "agent-event") {
          onEvent?.(event.data);
        } else if (event.type === "result") {
          result = event.data;
        } else {
          throw new Error(event.data.message);
        }
      });

      if (done) {
        streamEnded = true;
        break;
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Agent chat cancelled", { cause: error });
    }
    throw error;
  } finally {
    if (!streamEnded) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }

  if (!result) {
    throw new Error("Agent chat stream ended without a result");
  }

  return result;
}

export async function fetchAgentRun(
  runId: string,
  options: { baseUrl?: string; fetcher?: typeof fetch } = {},
): Promise<AgentRunSnapshot> {
  return requestAgentRun("GET", runId, options);
}

export async function cancelAgentRun(
  runId: string,
  options: { baseUrl?: string; fetcher?: typeof fetch } = {},
): Promise<AgentRunSnapshot> {
  return requestAgentRun("DELETE", runId, options);
}

async function requestAgentRun(
  method: "DELETE" | "GET",
  runId: string,
  {
    baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:14000",
    fetcher = fetch,
  }: { baseUrl?: string; fetcher?: typeof fetch },
) {
  const response = await fetcher(
    `${baseUrl}/agent/runs/${encodeURIComponent(runId)}`,
    { method },
  );
  if (!response.ok) {
    throw new Error(`Agent run request failed with status ${response.status}`);
  }
  return AgentRunSnapshotSchema.parse(await response.json());
}

function readSseMessages(buffer: string, onMessage: (message: string) => void) {
  let cursor = buffer.indexOf("\n\n");

  while (cursor >= 0) {
    if (cursor > maxAgentSseBufferCharacters) {
      throw new Error("Agent chat SSE message exceeded 16 MiB");
    }
    onMessage(buffer.slice(0, cursor));
    buffer = buffer.slice(cursor + 2);
    cursor = buffer.indexOf("\n\n");
  }

  if (buffer.length > maxAgentSseBufferCharacters) {
    throw new Error("Agent chat SSE message exceeded 16 MiB");
  }

  return buffer;
}

function parseSseMessage(message: string) {
  let event = "message";
  let data = "";

  for (const line of message.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      data += line.slice("data:".length).trimStart();
    }
  }

  const parsed = JSON.parse(data);

  if (event === "agent-event") {
    return {
      type: "agent-event" as const,
      data: AgentRunEventSchema.parse(parsed),
    };
  }

  if (event === "run-accepted") {
    const frame = z
      .object({
        runId: z.string().min(1),
        conversationId: z.string().min(1).optional(),
      })
      .parse(parsed);
    return { type: "run-accepted" as const, data: frame };
  }

  if (event === "result") {
    return {
      type: "result" as const,
      data: AgentRunResultSchema.parse(parsed),
    };
  }

  return {
    type: "error" as const,
    data: { message: String(parsed.message ?? "Agent chat failed") },
  };
}
