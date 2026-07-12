import { readAgentRunStreamFrames } from "@agent-template/agent-client";
import {
  AgentRunSnapshotSchema,
  type AgentInputResponse,
  type AgentRunEvent,
  type AgentRunResult,
  type AgentRunSnapshot,
} from "@agent-template/shared";

type StreamAgentChatOptions = {
  prompt: string;
  baseUrl?: string;
  conversationId?: string;
  fetcher?: typeof fetch;
  inputResponses?: AgentInputResponse[];
  onAccepted?: (input: { runId: string; conversationId?: string }) => void;
  onEvent?: (event: AgentRunEvent) => void;
  signal?: AbortSignal;
};

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
  } catch (cause) {
    if (signal?.aborted) {
      throw new Error("Agent chat cancelled", { cause });
    }
    throw new Error("Unable to reach Agent chat API", { cause });
  }

  let result: AgentRunResult | undefined;
  try {
    for await (const frame of readAgentRunStreamFrames(response)) {
      if (frame.type === "accepted") {
        onAccepted?.({
          runId: frame.runId,
          ...(frame.conversationId
            ? { conversationId: frame.conversationId }
            : {}),
        });
      } else if (frame.type === "event") {
        onEvent?.(frame.event);
      } else {
        result = frame.result;
      }
    }
  } catch (cause) {
    if (signal?.aborted) {
      throw new Error("Agent chat cancelled", { cause });
    }
    throw cause;
  }

  if (!result) {
    throw new Error("Agent chat stream ended without a result");
  }
  return result;
}

export async function cancelAgentRun(
  runId: string,
  {
    baseUrl = "/api",
    fetcher = fetch,
  }: { baseUrl?: string; fetcher?: typeof fetch } = {},
): Promise<AgentRunSnapshot> {
  const response = await fetcher(
    `${baseUrl}/agent/runs/${encodeURIComponent(runId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Agent run request failed with status ${response.status}`);
  }
  return AgentRunSnapshotSchema.parse(await response.json());
}
