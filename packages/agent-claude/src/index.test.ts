import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultAnthropicBaseUrl,
  defaultClaudeAgentMaxTurns,
  defaultClaudeAgentModel,
  getClaudeAgentRuntimeStateFromEnv,
  parseClaudeAgentConfig,
  runClaudeAgent,
} from "./index.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

describe("Claude Agent runtime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("installs project Toolbox business skills", () => {
    const skillNames = [
      "ecommerce-sales-analysis",
      "ecommerce-product-analysis",
      "ecommerce-order-operations",
      "ecommerce-fulfillment-operations",
    ];

    for (const skillName of skillNames) {
      const skill = readFileSync(
        new URL(
          `../../../.claude/skills/${skillName}/SKILL.md`,
          import.meta.url,
        ),
        "utf8",
      );

      expect(skill).toContain(`name: ${skillName}`);
      expect(skill).toContain("Toolbox MCP Tool");
      expect(skill).toContain("Business semantic catalog");
      expect(skill).toMatch(/^### `mcp__toolbox__[a-z0-9_-]+`$/m);

      const semanticCatalog = readFileSync(
        new URL(
          `../../../.claude/skills/${skillName}/references/ecommerce-semantic-catalog.yaml`,
          import.meta.url,
        ),
        "utf8",
      );
      expect(semanticCatalog).toContain("kind: business-semantic-catalog");
    }
  });

  it("does not require an Anthropic API key", () => {
    const state = getClaudeAgentRuntimeStateFromEnv({});

    expect(state.configured).toBe(false);
    expect(state.model).toBe(defaultClaudeAgentModel);
  });

  it("supports Kimi through the Anthropic-compatible protocol env", async () => {
    const calls: unknown[] = [];

    await expect(
      runClaudeAgent(
        { prompt: "Summarize this template" },
        {
          authToken: "test-token",
          baseUrl: defaultAnthropicBaseUrl,
          model: "kimi-for-coding",
        },
        {
          loadSdk: async () => ({
            query(params) {
              calls.push(params);

              return (async function* () {
                yield {
                  duration_api_ms: 0,
                  duration_ms: 0,
                  is_error: false,
                  modelUsage: {},
                  num_turns: 1,
                  permission_denials: [],
                  result: "Done",
                  session_id: "claude-session-1",
                  stop_reason: "stop",
                  subtype: "success",
                  total_cost_usd: 0,
                  type: "result",
                  usage: {},
                } as unknown as SDKMessage;
              })();
            },
          }),
        },
      ),
    ).resolves.toMatchObject({
      events: [{ kind: "done", result: "Done" }],
      output: "Done",
      status: "completed",
    });

    expect(calls).toMatchObject([
      {
        options: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "test-token",
            ANTHROPIC_BASE_URL: defaultAnthropicBaseUrl,
            CLAUDE_CODE_AUTO_COMPACT_WINDOW: "262144",
            CLAUDE_CONFIG_DIR: expect.any(String),
          },
          cwd: expect.any(String),
          includePartialMessages: true,
          maxTurns: defaultClaudeAgentMaxTurns,
          permissionMode: "dontAsk",
          persistSession: false,
          settingSources: ["project"],
          skills: "all",
          tools: [],
        },
      },
    ]);

    const subprocessEnv = (
      calls[0] as { options: { env: Record<string, string | undefined> } }
    ).options.env;
    expect(subprocessEnv).not.toHaveProperty("ANTHROPIC_DEFAULT_HAIKU_MODEL");
    expect(subprocessEnv).not.toHaveProperty("ANTHROPIC_DEFAULT_OPUS_MODEL");
    expect(subprocessEnv).not.toHaveProperty("ANTHROPIC_DEFAULT_SONNET_MODEL");
    expect(subprocessEnv).not.toHaveProperty("ANTHROPIC_MODEL");
  });

  it("forwards Claude partial text events while the model streams", async () => {
    const events: unknown[] = [];

    await expect(
      runClaudeAgent(
        { prompt: "Stream a short reply" },
        {
          authToken: "test-token",
          baseUrl: defaultAnthropicBaseUrl,
          model: "kimi-for-coding",
        },
        {
          loadSdk: async () => ({
            query() {
              return (async function* () {
                yield {
                  event: {
                    content_block: { citations: null, text: "", type: "text" },
                    index: 0,
                    type: "content_block_start",
                  },
                  parent_tool_use_id: null,
                  session_id: "claude-session-1",
                  type: "stream_event",
                  uuid: "partial-1",
                } as unknown as SDKMessage;
                yield {
                  event: {
                    delta: { text: "Hel", type: "text_delta" },
                    index: 0,
                    type: "content_block_delta",
                  },
                  parent_tool_use_id: null,
                  session_id: "claude-session-1",
                  type: "stream_event",
                  uuid: "partial-2",
                } as unknown as SDKMessage;
                yield {
                  event: {
                    delta: { text: "lo", type: "text_delta" },
                    index: 0,
                    type: "content_block_delta",
                  },
                  parent_tool_use_id: null,
                  session_id: "claude-session-1",
                  type: "stream_event",
                  uuid: "partial-3",
                } as unknown as SDKMessage;
                yield {
                  duration_api_ms: 0,
                  duration_ms: 0,
                  is_error: false,
                  modelUsage: {},
                  num_turns: 1,
                  permission_denials: [],
                  result: "Hello",
                  session_id: "claude-session-1",
                  stop_reason: "stop",
                  subtype: "success",
                  total_cost_usd: 0,
                  type: "result",
                  usage: {},
                } as unknown as SDKMessage;
              })();
            },
          }),
          onEvent(event) {
            events.push(event);
          },
        },
      ),
    ).resolves.toMatchObject({
      events: [
        { kind: "text", text: "Hel" },
        { kind: "text", text: "Hello" },
        { kind: "done", result: "Hello" },
      ],
      output: "Hello",
      status: "completed",
    });

    expect(events).toEqual([
      { kind: "text", text: "Hel" },
      { kind: "text", text: "Hello" },
      { kind: "done", result: "Hello" },
    ]);
  });

  it("connects Claude directly to the Toolbox MCP server", async () => {
    const calls: unknown[] = [];

    await expect(
      runClaudeAgent(
        { prompt: "List recent agent runs" },
        parseClaudeAgentConfig({
          ANTHROPIC_AUTH_TOKEN: "test-token",
          ANTHROPIC_BASE_URL: defaultAnthropicBaseUrl,
          ANTHROPIC_MODEL: "kimi-for-coding",
          TOOLBOX_URL: "http://toolbox:15000",
        }),
        {
          loadSdk: async () => ({
            query(params) {
              calls.push(params);

              return (async function* () {
                yield {
                  message: {
                    content: [
                      {
                        id: "toolu-1",
                        input: { limit: 3 },
                        name: "mcp__toolbox__list-agent-runs",
                        type: "tool_use",
                      },
                    ],
                    role: "assistant",
                  },
                  parent_tool_use_id: null,
                  session_id: "claude-session-1",
                  type: "assistant",
                } as unknown as SDKMessage;
                yield {
                  duration_api_ms: 0,
                  duration_ms: 0,
                  is_error: false,
                  modelUsage: {},
                  num_turns: 1,
                  permission_denials: [],
                  result: "Found recent runs",
                  session_id: "claude-session-1",
                  stop_reason: "stop",
                  subtype: "success",
                  total_cost_usd: 0,
                  type: "result",
                  usage: {},
                } as unknown as SDKMessage;
              })();
            },
          }),
        },
      ),
    ).resolves.toMatchObject({
      events: [
        {
          input: '{"limit":3}',
          kind: "tool-call",
          tool: "mcp__toolbox__list-agent-runs",
        },
        { kind: "done", result: "Found recent runs" },
      ],
      status: "completed",
    });

    const options = (
      calls[0] as {
        options: {
          allowedTools: string[];
          env: Record<string, string | undefined>;
          mcpServers: Record<string, unknown>;
        };
      }
    ).options;
    expect(options.allowedTools).toHaveLength(18);
    expect(options.allowedTools).toContain("mcp__toolbox__list-agent-runs");
    expect(options.mcpServers).toMatchObject({
      toolbox: {
        type: "http",
        url: "http://toolbox:15000/mcp",
      },
    });
    expect(options.env).not.toHaveProperty("TOOLBOX_URL");
    expect(options.env).not.toHaveProperty("TOOLBOX_AUTH_TOKEN");
  });

  it("applies one capability profile and keeps the bearer token out of model env", async () => {
    const calls: unknown[] = [];
    vi.stubEnv("TOOLBOX_AUTH_TOKEN", "ambient-toolbox-token");
    vi.stubEnv("TOOLBOX_URL", "http://ambient-toolbox:15000");

    await runClaudeAgent(
      { prompt: "Summarize ecommerce sales" },
      parseClaudeAgentConfig({
        AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
        ANTHROPIC_AUTH_TOKEN: "test-token",
        ANTHROPIC_BASE_URL: defaultAnthropicBaseUrl,
        ANTHROPIC_MODEL: "kimi-for-coding",
        TOOLBOX_AUTH_TOKEN: "toolbox-token",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
      {
        loadSdk: async () => ({
          query(params) {
            calls.push(params);
            return (async function* () {
              yield {
                duration_api_ms: 0,
                duration_ms: 0,
                is_error: false,
                modelUsage: {},
                num_turns: 1,
                permission_denials: [],
                result: "Done",
                session_id: "claude-session-1",
                stop_reason: "stop",
                subtype: "success",
                total_cost_usd: 0,
                type: "result",
                usage: {},
              } as unknown as SDKMessage;
            })();
          },
        }),
      },
    );

    const options = (
      calls[0] as {
        options: {
          allowedTools: string[];
          env: Record<string, string | undefined>;
          mcpServers: {
            toolbox: {
              headers?: Record<string, string>;
              tools: Array<{
                name: string;
                permission_policy: string;
              }>;
            };
          };
        };
      }
    ).options;

    expect(options.allowedTools).toEqual([
      "mcp__toolbox__summarize-ecommerce-sales-by-day",
      "mcp__toolbox__summarize-ecommerce-sales-by-channel",
      "mcp__toolbox__summarize_sales_by_region",
      "mcp__toolbox__summarize_sales_by_customer_segment",
    ]);
    expect(options.mcpServers.toolbox.headers).toEqual({
      Authorization: "Bearer toolbox-token",
    });
    expect(
      options.mcpServers.toolbox.tools.find(
        (tool) => tool.name === "summarize-ecommerce-sales-by-day",
      )?.permission_policy,
    ).toBe("always_allow");
    expect(
      options.mcpServers.toolbox.tools.find(
        (tool) => tool.name === "get-ecommerce-order-detail",
      )?.permission_policy,
    ).toBe("always_deny");
    expect(options.env).not.toHaveProperty("TOOLBOX_AUTH_TOKEN");
  });
});
