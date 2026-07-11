import {
  AgentJobAcceptedSchema,
  AgentRunResultSchema,
  AgentRunEventSchema,
  type AgentJobAccepted,
  type AgentRunEvent,
  type AgentRunResult,
} from "@agent-template/shared";

export type { AgentJobAccepted };

type SubmitAgentJobOptions = {
  prompt: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

type StreamAgentChatOptions = SubmitAgentJobOptions & {
  onEvent?: (event: AgentRunEvent) => void;
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
  prompt,
  baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:14000",
  fetcher = fetch,
  onEvent,
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
      body: JSON.stringify({ prompt: trimmedPrompt }),
    });
  } catch {
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

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    buffer = readSseMessages(buffer, (message) => {
      const event = parseSseMessage(message);

      if (event.type === "agent-event") {
        onEvent?.(event.data);
      } else if (event.type === "result") {
        result = event.data;
      } else {
        throw new Error(event.data.message);
      }
    });

    if (done) {
      break;
    }
  }

  if (!result) {
    throw new Error("Agent chat stream ended without a result");
  }

  return result;
}

function readSseMessages(buffer: string, onMessage: (message: string) => void) {
  let cursor = buffer.indexOf("\n\n");

  while (cursor >= 0) {
    onMessage(buffer.slice(0, cursor));
    buffer = buffer.slice(cursor + 2);
    cursor = buffer.indexOf("\n\n");
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
