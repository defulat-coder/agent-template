import { z } from "zod";
import {
  AgentConversationPageSchema,
  AgentConversationViewSchema,
  AgentJobRequestSchema,
  AgentRunInputSchema,
  AgentRunPageSchema,
  AgentRunSnapshotSchema,
  AgentRunStreamFrameSchema,
  HealthStatusSchema,
  maxAgentSseBufferCharacters,
  type AgentConversationCreateInput,
  type AgentConversationListQuery,
  type AgentConversationPage,
  type AgentConversationView,
  type AgentJobRequest,
  type AgentRunInput,
  type AgentRunListQuery,
  type AgentRunPage,
  type AgentRunSnapshot,
  type AgentRunStreamFrame,
  type HealthStatus,
} from "@agent-template/shared";

export type AgentClientConfig = {
  baseUrl: string | URL;
  token?: string;
  fetcher?: typeof fetch;
};

export type AgentRequestOptions = {
  signal?: AbortSignal;
};

export type AgentPlatformClient = {
  conversations: {
    create(
      input?: AgentConversationCreateInput,
      options?: AgentRequestOptions,
    ): Promise<AgentConversationView>;
    list(
      query?: Partial<AgentConversationListQuery>,
      options?: AgentRequestOptions,
    ): Promise<AgentConversationPage>;
    get(
      conversationId: string,
      options?: AgentRequestOptions,
    ): Promise<AgentConversationView>;
    send(
      conversationId: string,
      input: AgentRunInput,
      options?: AgentRequestOptions,
    ): AsyncIterable<AgentRunStreamFrame>;
  };
  runs: {
    start(
      input: AgentRunInput,
      options?: AgentRequestOptions,
    ): AsyncIterable<AgentRunStreamFrame>;
    list(
      query?: Partial<AgentRunListQuery>,
      options?: AgentRequestOptions,
    ): Promise<AgentRunPage>;
    get(
      runId: string,
      options?: AgentRequestOptions,
    ): Promise<AgentRunSnapshot>;
    watch(
      runId: string,
      input?: { afterSequence?: number },
      options?: AgentRequestOptions,
    ): AsyncIterable<AgentRunStreamFrame>;
    cancel(
      runId: string,
      options?: AgentRequestOptions,
    ): Promise<AgentRunSnapshot>;
  };
  jobs: {
    submit(
      input: AgentJobRequest,
      options?: AgentRequestOptions,
    ): Promise<{ runId: string }>;
  };
  health(options?: AgentRequestOptions): Promise<HealthStatus>;
  meta(options?: AgentRequestOptions): Promise<{
    protocolVersion: string;
    capabilities: string[];
  }>;
};

const AgentJobSubmissionSchema = z.object({ runId: z.string() });
const AgentMetaSchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.array(z.string()),
});
const AgentErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean().default(false),
  }),
});

export class AgentClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(input: {
    code: string;
    message: string;
    retryable?: boolean;
    status?: number;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "AgentClientError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    if (input.status !== undefined) this.status = input.status;
  }
}

export function createAgentPlatformClient(
  config: AgentClientConfig,
): AgentPlatformClient {
  const fetcher = config.fetcher ?? fetch;
  const baseUrl = new URL(config.baseUrl).toString().replace(/\/$/, "");

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        ...init,
        headers: headers(config.token, init.headers),
      });
    } catch (cause) {
      if (init.signal?.aborted) {
        throw new AgentClientError({
          code: "ABORTED",
          message: "Agent 请求已取消",
          cause,
        });
      }
      throw new AgentClientError({
        code: "UNREACHABLE",
        message: "无法连接 Agent API",
        retryable: true,
        cause,
      });
    }
    if (!response.ok) throw await readResponseError(response);
    try {
      return schema.parse(await response.json());
    } catch (cause) {
      throw new AgentClientError({
        code: "PROTOCOL_ERROR",
        message: "Agent API 返回了不兼容的数据",
        status: response.status,
        cause,
      });
    }
  }

  async function* stream(
    path: string,
    init: RequestInit,
  ): AsyncIterable<AgentRunStreamFrame> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        ...init,
        headers: headers(config.token, init.headers),
      });
    } catch (cause) {
      throw new AgentClientError({
        code: init.signal?.aborted ? "ABORTED" : "UNREACHABLE",
        message: init.signal?.aborted
          ? "Agent 请求已取消"
          : "无法连接 Agent API",
        retryable: !init.signal?.aborted,
        cause,
      });
    }
    if (!response.ok) throw await readResponseError(response);
    if (!response.body) {
      throw new AgentClientError({
        code: "PROTOCOL_ERROR",
        message: "Agent API 未返回事件流",
        status: response.status,
      });
    }
    for await (const message of parseSse(response.body)) {
      if (message.event === "frame") {
        try {
          yield AgentRunStreamFrameSchema.parse(JSON.parse(message.data));
        } catch (cause) {
          throw new AgentClientError({
            code: "PROTOCOL_ERROR",
            message: "Agent 事件流包含不兼容的数据",
            cause,
          });
        }
      } else if (message.event === "error") {
        const envelope = AgentErrorEnvelopeSchema.safeParse(
          JSON.parse(message.data),
        );
        throw new AgentClientError(
          envelope.success
            ? envelope.data.error
            : { code: "STREAM_FAILED", message: "Agent 事件流失败" },
        );
      }
    }
  }

  return {
    conversations: {
      create(input = {}, options = {}) {
        const body = JSON.stringify(input);
        return request("/v1/agent/conversations", AgentConversationViewSchema, {
          method: "POST",
          body,
          ...(options.signal ? { signal: options.signal } : {}),
        });
      },
      list(query = {}, options = {}) {
        return request(
          `/v1/agent/conversations${toQuery(query)}`,
          AgentConversationPageSchema,
          options.signal ? { signal: options.signal } : {},
        );
      },
      get(conversationId, options = {}) {
        return request(
          `/v1/agent/conversations/${encodeURIComponent(conversationId)}`,
          AgentConversationViewSchema,
          options.signal ? { signal: options.signal } : {},
        );
      },
      send(conversationId, input, options = {}) {
        return stream(
          `/v1/agent/conversations/${encodeURIComponent(conversationId)}/runs`,
          {
            method: "POST",
            body: JSON.stringify(AgentRunInputSchema.parse(input)),
            ...(options.signal ? { signal: options.signal } : {}),
          },
        );
      },
    },
    runs: {
      start(input, options = {}) {
        return stream("/v1/agent/runs", {
          method: "POST",
          body: JSON.stringify(AgentRunInputSchema.parse(input)),
          ...(options.signal ? { signal: options.signal } : {}),
        });
      },
      list(query = {}, options = {}) {
        return request(
          `/v1/agent/runs${toQuery({
            ...query,
            ...(query.status ? { status: query.status.join(",") } : {}),
          })}`,
          AgentRunPageSchema,
          options.signal ? { signal: options.signal } : {},
        );
      },
      get(runId, options = {}) {
        return request(
          `/v1/agent/runs/${encodeURIComponent(runId)}`,
          AgentRunSnapshotSchema,
          options.signal ? { signal: options.signal } : {},
        );
      },
      watch(runId, input = {}, options = {}) {
        return stream(
          `/v1/agent/runs/${encodeURIComponent(runId)}/events${toQuery({
            follow: "true",
            ...(input.afterSequence !== undefined
              ? { afterSequence: input.afterSequence }
              : {}),
          })}`,
          options.signal ? { signal: options.signal } : {},
        );
      },
      cancel(runId, options = {}) {
        return request(
          `/v1/agent/runs/${encodeURIComponent(runId)}`,
          AgentRunSnapshotSchema,
          {
            method: "DELETE",
            ...(options.signal ? { signal: options.signal } : {}),
          },
        );
      },
    },
    jobs: {
      submit(input, options = {}) {
        return request("/v1/agent/jobs", AgentJobSubmissionSchema, {
          method: "POST",
          body: JSON.stringify(AgentJobRequestSchema.parse(input)),
          ...(options.signal ? { signal: options.signal } : {}),
        });
      },
    },
    health(options = {}) {
      return request(
        "/health",
        HealthStatusSchema,
        options.signal ? { signal: options.signal } : {},
      );
    },
    meta(options = {}) {
      return request(
        "/v1/agent/meta",
        AgentMetaSchema,
        options.signal ? { signal: options.signal } : {},
      );
    },
  };
}

type SseMessage = { event: string; data: string; id?: string };

async function* parseSse(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamEnded = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        assertAgentSseFrameSize(boundary);
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const message = parseSseBlock(block);
        if (message) yield message;
        boundary = buffer.indexOf("\n\n");
      }
      assertAgentSseFrameSize(buffer.length);
      if (done) {
        streamEnded = true;
        break;
      }
    }
    if (buffer.trim()) {
      const message = parseSseBlock(buffer);
      if (message) yield message;
    }
  } finally {
    if (!streamEnded) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function assertAgentSseFrameSize(length: number) {
  if (length <= maxAgentSseBufferCharacters) return;
  throw new AgentClientError({
    code: "PROTOCOL_ERROR",
    message: "Agent SSE message exceeded 16 MiB",
  });
}

function parseSseBlock(block: string): SseMessage | undefined {
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator >= 0 ? line.slice(0, separator) : line;
    const value =
      separator >= 0 ? line.slice(separator + 1).replace(/^ /, "") : "";
    if (field === "event") event = value;
    if (field === "id") id = value;
    if (field === "data") data.push(value);
  }
  if (!data.length) return undefined;
  return { event, data: data.join("\n"), ...(id ? { id } : {}) };
}

async function readResponseError(response: Response) {
  try {
    const parsed = AgentErrorEnvelopeSchema.parse(await response.json());
    return new AgentClientError({
      ...parsed.error,
      status: response.status,
    });
  } catch (cause) {
    return new AgentClientError({
      code: "REMOTE_ERROR",
      message: `Agent API 请求失败（${response.status}）`,
      retryable: response.status >= 500,
      status: response.status,
      cause,
    });
  }
}

function headers(token: string | undefined, input?: HeadersInit) {
  const result = new Headers(input);
  result.set("Accept", "application/json, text/event-stream");
  result.set("Content-Type", "application/json");
  result.set("X-Agent-Client-Version", "1");
  if (token) result.set("Authorization", `Bearer ${token}`);
  return result;
}

function toQuery(input: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
