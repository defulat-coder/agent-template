import {
  AgentClientError,
  createAgentPlatformClient,
  type AgentPlatformClient,
} from "@agent-template/agent-client";
import { z, ZodError } from "zod";

const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z.string().url().optional(),
);
const optionalToken = z.preprocess(
  emptyStringToUndefined,
  z.string().min(16).optional(),
);
const ServerAgentClientEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AGENT_API_URL: optionalUrl,
    AGENT_TEMPLATE_TOKEN: optionalToken,
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && !env.AGENT_TEMPLATE_TOKEN) {
      context.addIssue({
        code: "custom",
        path: ["AGENT_TEMPLATE_TOKEN"],
        message: "AGENT_TEMPLATE_TOKEN is required in production",
      });
    }
  });

export type ServerAgentClientConfig = {
  baseUrl: string;
  token?: string;
};

export type ServerAgentError = {
  status: number;
  envelope: {
    error: {
      code: string;
      message: string;
      retryable: boolean;
    };
  };
};

class ServerAgentConfigurationError extends Error {
  constructor(cause: ZodError) {
    super("Web gateway Agent API 配置无效", { cause });
    this.name = "ServerAgentConfigurationError";
  }
}

export function loadServerAgentClientConfig(
  env: Record<string, string | undefined> = process.env,
): ServerAgentClientConfig {
  const parsed = ServerAgentClientEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ServerAgentConfigurationError(parsed.error);
  }
  return {
    baseUrl: parsed.data.AGENT_API_URL ?? "http://localhost:14000",
    ...(parsed.data.AGENT_TEMPLATE_TOKEN
      ? { token: parsed.data.AGENT_TEMPLATE_TOKEN }
      : {}),
  };
}

export function createServerAgentClient(
  options: {
    config?: ServerAgentClientConfig;
    fetcher?: typeof fetch;
  } = {},
): AgentPlatformClient {
  const config = options.config ?? loadServerAgentClientConfig();
  return createAgentPlatformClient({
    ...config,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
  });
}

export function describeServerAgentError(error: unknown): ServerAgentError {
  if (error instanceof AgentClientError) {
    return {
      status:
        error.status !== undefined && error.status >= 400
          ? error.status
          : clientErrorStatus(error.code),
      envelope: {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
    };
  }
  if (error instanceof ServerAgentConfigurationError) {
    return {
      status: 500,
      envelope: {
        error: {
          code: "CONFIGURATION_ERROR",
          message: "Web gateway Agent API 配置无效",
          retryable: false,
        },
      },
    };
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return {
      status: 400,
      envelope: {
        error: {
          code: "INVALID_INPUT",
          message: "请求参数无效",
          retryable: false,
        },
      },
    };
  }
  return {
    status: 500,
    envelope: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Web gateway 处理失败",
        retryable: false,
      },
    },
  };
}

export function createServerAgentErrorResponse(error: unknown): Response {
  const described = describeServerAgentError(error);
  return Response.json(described.envelope, { status: described.status });
}

export function linkAbortSignal(
  source: AbortSignal,
  target: AbortController,
): () => void {
  const abort = () => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && !value.trim() ? undefined : value;
}

function clientErrorStatus(code: string): number {
  if (code === "ABORTED") return 499;
  if (
    code === "UNREACHABLE" ||
    code === "PROTOCOL_ERROR" ||
    code === "STREAM_FAILED"
  ) {
    return 502;
  }
  return 500;
}
