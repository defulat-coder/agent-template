import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultAnthropicBaseUrl,
  defaultClaudeAgentMaxTurns,
  defaultClaudeAgentModel,
  getClaudeAgentRuntimeStateFromEnv,
  runClaudeAgent,
} from "./index.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

describe("Claude Agent runtime", () => {
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
      expect(skill).toContain("Host-managed typed tools");
      expect(skill).toMatch(/^### [a-z0-9]+-[a-z0-9-]+$/m);
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
            createSdkMcpServer(options) {
              return {
                ...options,
                instance: {} as never,
                name: String(options.name),
                type: "sdk",
              };
            },
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
            tool(name, description, inputSchema, handler) {
              return { description, handler, inputSchema, name };
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
            createSdkMcpServer(options) {
              return {
                ...options,
                instance: {} as never,
                name: String(options.name),
                type: "sdk",
              };
            },
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
            tool(name, description, inputSchema, handler) {
              return { description, handler, inputSchema, name };
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

  it("exposes Toolbox through a Host-managed SDK MCP server", async () => {
    const calls: unknown[] = [];

    await expect(
      runClaudeAgent(
        { prompt: "List recent agent runs" },
        {
          authToken: "test-token",
          baseUrl: defaultAnthropicBaseUrl,
          model: "kimi-for-coding",
          toolboxToolset: "agent_template_read_model",
          toolboxUrl: "http://toolbox:15000",
        },
        {
          loadSdk: async () => ({
            createSdkMcpServer(options) {
              return {
                ...options,
                instance: {} as never,
                name: String(options.name),
                type: "sdk",
              };
            },
            query(params) {
              calls.push(params);

              return (async function* () {
                yield {
                  session_id: "claude-session-1",
                  subtype: "thinking_tokens",
                  type: "system",
                } as unknown as SDKMessage;
                yield {
                  message: {
                    content: [
                      {
                        id: "toolu-1",
                        input: { limit: 3 },
                        name: "mcp__agent_template_mcp_host__list-agent-runs",
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
            tool(name, description, inputSchema, handler) {
              return { description, handler, inputSchema, name };
            },
          }),
        },
      ),
    ).resolves.toMatchObject({
      events: [
        {
          input: '{"limit":3}',
          kind: "tool-call",
          tool: "mcp__agent_template_mcp_host__list-agent-runs",
        },
        { kind: "done", result: "Found recent runs" },
      ],
      output: "Found recent runs",
      status: "completed",
    });

    expect(calls).toMatchObject([
      {
        options: {
          allowedTools: [
            "mcp__agent_template_mcp_host__get-agent-run-summary",
            "mcp__agent_template_mcp_host__get-ecommerce-order-detail",
            "mcp__agent_template_mcp_host__get-template-event",
            "mcp__agent_template_mcp_host__list-agent-run-timeline",
            "mcp__agent_template_mcp_host__list-agent-runs",
            "mcp__agent_template_mcp_host__list-ecommerce-fulfillment-exceptions",
            "mcp__agent_template_mcp_host__list-ecommerce-orders-in-window",
            "mcp__agent_template_mcp_host__list-ecommerce-top-products",
            "mcp__agent_template_mcp_host__list-failed-agent-runs-in-window",
            "mcp__agent_template_mcp_host__list-template-events",
            "mcp__agent_template_mcp_host__list-template-events-in-window",
            "mcp__agent_template_mcp_host__summarize-template-events-by-type",
            "mcp__agent_template_mcp_host__summarize-ecommerce-sales-by-channel",
            "mcp__agent_template_mcp_host__summarize-ecommerce-sales-by-day",
            "mcp__agent_template_mcp_host__summarize-tool-invocations",
          ],
          cwd: expect.any(String),
          includePartialMessages: true,
          settingSources: ["project"],
          skills: "all",
          mcpServers: {
            agent_template_mcp_host: {
              name: "agent_template_mcp_host",
              type: "sdk",
              tools: [
                expect.objectContaining({ name: "list-agent-runs" }),
                expect.objectContaining({ name: "get-agent-run-summary" }),
                expect.objectContaining({ name: "list-agent-run-timeline" }),
                expect.objectContaining({ name: "list-template-events" }),
                expect.objectContaining({
                  name: "summarize-ecommerce-sales-by-day",
                }),
                expect.objectContaining({
                  name: "summarize-ecommerce-sales-by-channel",
                }),
                expect.objectContaining({
                  name: "list-ecommerce-top-products",
                }),
                expect.objectContaining({
                  name: "list-ecommerce-orders-in-window",
                }),
                expect.objectContaining({
                  name: "get-ecommerce-order-detail",
                }),
                expect.objectContaining({
                  name: "list-ecommerce-fulfillment-exceptions",
                }),
                expect.objectContaining({
                  name: "list-template-events-in-window",
                }),
                expect.objectContaining({
                  name: "summarize-template-events-by-type",
                }),
                expect.objectContaining({
                  name: "list-failed-agent-runs-in-window",
                }),
                expect.objectContaining({ name: "summarize-tool-invocations" }),
                expect.objectContaining({ name: "get-template-event" }),
              ],
              version: "0.1.0",
            },
          },
        },
      },
    ]);
    const subprocessEnv = (
      calls[0] as { options: { env: Record<string, string | undefined> } }
    ).options.env;
    expect(subprocessEnv).not.toHaveProperty("TOOLBOX_URL");
    expect(subprocessEnv).not.toHaveProperty("TOOLBOX_TOOLSET");
  });

  it("exposes Host-managed MCP tools from filesystem config without Toolbox env", async () => {
    const previousInitCwd = process.env.INIT_CWD;
    const dir = mkdtempSync(join(tmpdir(), "claude-mcp-host-config-"));
    const calls: unknown[] = [];
    process.env.INIT_CWD = dir;
    writeFileSync(
      join(dir, "mcp-host.config.json"),
      JSON.stringify({
        servers: {
          toolbox: {
            toolset: "agent_template_read_model",
            url: "http://file-toolbox:15000",
          },
        },
      }),
      "utf8",
    );

    try {
      await expect(
        runClaudeAgent(
          { prompt: "List recent agent runs" },
          {
            authToken: "test-token",
            baseUrl: defaultAnthropicBaseUrl,
            model: "kimi-for-coding",
          },
          {
            loadSdk: async () => ({
              createSdkMcpServer(options) {
                return {
                  ...options,
                  instance: {} as never,
                  name: String(options.name),
                  type: "sdk",
                };
              },
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
              tool(name, description, inputSchema, handler) {
                return { description, handler, inputSchema, name };
              },
            }),
          },
        ),
      ).resolves.toMatchObject({
        output: "Found recent runs",
        status: "completed",
      });

      expect(calls).toMatchObject([
        {
          options: {
            allowedTools: [
              "mcp__agent_template_mcp_host__get-agent-run-summary",
              "mcp__agent_template_mcp_host__get-ecommerce-order-detail",
              "mcp__agent_template_mcp_host__get-template-event",
              "mcp__agent_template_mcp_host__list-agent-run-timeline",
              "mcp__agent_template_mcp_host__list-agent-runs",
              "mcp__agent_template_mcp_host__list-ecommerce-fulfillment-exceptions",
              "mcp__agent_template_mcp_host__list-ecommerce-orders-in-window",
              "mcp__agent_template_mcp_host__list-ecommerce-top-products",
              "mcp__agent_template_mcp_host__list-failed-agent-runs-in-window",
              "mcp__agent_template_mcp_host__list-template-events",
              "mcp__agent_template_mcp_host__list-template-events-in-window",
              "mcp__agent_template_mcp_host__summarize-template-events-by-type",
              "mcp__agent_template_mcp_host__summarize-ecommerce-sales-by-channel",
              "mcp__agent_template_mcp_host__summarize-ecommerce-sales-by-day",
              "mcp__agent_template_mcp_host__summarize-tool-invocations",
            ],
            settingSources: ["project"],
            skills: "all",
            mcpServers: {
              agent_template_mcp_host: {
                name: "agent_template_mcp_host",
                type: "sdk",
              },
            },
          },
        },
      ]);
    } finally {
      if (previousInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = previousInitCwd;
      }
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
