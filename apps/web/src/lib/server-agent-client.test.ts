import { describe, expect, it, vi } from "vitest";
import { AgentClientError } from "@agent-template/agent-client";
import {
  createServerAgentClient,
  describeServerAgentError,
  linkAbortSignal,
  loadServerAgentClientConfig,
} from "./server-agent-client";

describe("server Agent Client configuration", () => {
  it("uses only the server-side upstream URL and token", async () => {
    const config = loadServerAgentClientConfig({
      AGENT_API_URL: "https://agent.internal.example.com/",
      AGENT_TEMPLATE_TOKEN: "server-token-1234",
      NEXT_PUBLIC_API_BASE_URL: "https://public.example.com",
    });
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return Response.json({
          service: "agent-template-api",
          status: "ok",
          timestamp: "2026-07-12T00:00:00.000Z",
          database: { status: "ok", message: "ready" },
          redis: { status: "ok", message: "ready" },
          queue: { name: "agent-jobs", status: "ready" },
          agent: {
            runtime: "claude",
            configured: true,
            model: "test-model",
            readiness: { status: "ok", message: "ready" },
          },
          toolbox: {
            configured: true,
            url: "http://toolbox:15000",
            capabilityProfile: "development-all",
          },
        });
      },
    );
    const client = createServerAgentClient({ config, fetcher });

    await client.health();

    expect(config.baseUrl).toBe("https://agent.internal.example.com/");
    expect(fetcher).toHaveBeenCalledWith(
      "https://agent.internal.example.com/health",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer server-token-1234");
  });

  it("does not use a public browser URL as a server fallback", () => {
    expect(
      loadServerAgentClientConfig({
        NEXT_PUBLIC_API_BASE_URL: "https://public.example.com",
      }),
    ).toEqual({ baseUrl: "http://localhost:14000" });
  });

  it("requires the private upstream token in production", () => {
    expect(() =>
      loadServerAgentClientConfig({
        NODE_ENV: "production",
        AGENT_API_URL: "https://agent.internal.example.com",
      }),
    ).toThrow("Web gateway Agent API 配置无效");

    let error: unknown;
    try {
      loadServerAgentClientConfig({ NODE_ENV: "production" });
    } catch (cause) {
      error = cause;
    }
    expect(describeServerAgentError(error)).toEqual({
      status: 500,
      envelope: {
        error: {
          code: "CONFIGURATION_ERROR",
          message: "Web gateway Agent API 配置无效",
          retryable: false,
        },
      },
    });
  });
});

describe("server Agent Client errors", () => {
  it("preserves structured upstream errors", () => {
    expect(
      describeServerAgentError(
        new AgentClientError({
          code: "CONVERSATION_BUSY",
          message: "会话繁忙",
          retryable: true,
          status: 409,
        }),
      ),
    ).toEqual({
      status: 409,
      envelope: {
        error: {
          code: "CONVERSATION_BUSY",
          message: "会话繁忙",
          retryable: true,
        },
      },
    });
  });

  it("classifies malformed request JSON as invalid input", () => {
    expect(describeServerAgentError(new SyntaxError("bad JSON"))).toEqual({
      status: 400,
      envelope: {
        error: {
          code: "INVALID_INPUT",
          message: "请求参数无效",
          retryable: false,
        },
      },
    });
  });

  it("maps a protocol failure on a 2xx upstream response to 502", () => {
    expect(
      describeServerAgentError(
        new AgentClientError({
          code: "PROTOCOL_ERROR",
          message: "Agent API 返回了不兼容的数据",
          status: 200,
        }),
      ),
    ).toMatchObject({
      status: 502,
      envelope: { error: { code: "PROTOCOL_ERROR" } },
    });
  });
});

describe("server Agent abort propagation", () => {
  it("forwards an abort that happened before the upstream link was installed", () => {
    const source = new AbortController();
    const target = new AbortController();
    source.abort("browser disconnected");

    const unlink = linkAbortSignal(source.signal, target);

    expect(target.signal.aborted).toBe(true);
    expect(target.signal.reason).toBe("browser disconnected");
    unlink();
  });
});
