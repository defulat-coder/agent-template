import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  toolboxBusinessCapabilityPacks,
  toolboxCapabilityProfiles,
} from "@agent-template/toolbox-config";
import {
  checkClaudeAgentReadiness,
  defaultAnthropicBaseUrl,
  defaultClaudeAgentMaxTurns,
  defaultClaudeAgentModel,
  getClaudeAgentRuntimeStateFromEnv,
  parseClaudeAgentConfig,
  runClaudeAgent,
} from "./index.js";
import type {
  createSdkMcpServer,
  SDKMessage,
  tool,
} from "@anthropic-ai/claude-agent-sdk";

const claudeProjectRoot = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);

function createFakeSemanticSdkFactories() {
  return {
    createSdkMcpServer: ((input: { name: string }) => ({
      type: "sdk",
      name: input.name,
      instance: {},
    })) as typeof createSdkMcpServer,
    tool: ((
      name: string,
      description: string,
      inputSchema: unknown,
      handler: unknown,
    ) => ({ description, handler, inputSchema, name })) as typeof tool,
  };
}

describe("Claude Agent runtime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("installs project Toolbox business skills", () => {
    for (const pack of toolboxBusinessCapabilityPacks) {
      const skill = readFileSync(
        new URL(`../.claude/skills/${pack.name}/SKILL.md`, import.meta.url),
        "utf8",
      );

      expect(skill).toContain(`name: ${pack.name}`);
      expect(skill).toContain("可执行语义层");
      expect(skill).toContain("Business semantic catalog");
      expect(skill).toContain("mcp__semantic_query__query_business_data");
      expect(skill).not.toMatch(/mcp__toolbox__[a-z0-9_-]+/u);

      const semanticCatalog = readFileSync(
        new URL(
          `../.claude/skills/${pack.name}/references/${pack.catalog}`,
          import.meta.url,
        ),
        "utf8",
      );
      expect(semanticCatalog).toContain("kind: business-semantic-catalog");
    }
  });

  it("keeps Claude project instructions inside the runtime package", () => {
    const instructions = readFileSync(
      new URL("../.claude/CLAUDE.md", import.meta.url),
      "utf8",
    );

    expect(instructions).toContain("Agent Template Claude Runtime");
    expect(instructions).toContain("filesystem-first");
  });

  it("does not require an Anthropic API key", () => {
    const state = getClaudeAgentRuntimeStateFromEnv({});

    expect(state.configured).toBe(false);
    expect(state.model).toBe(defaultClaudeAgentModel);
  });

  it("checks credentials and the configured Toolbox capability profile", async () => {
    let closed = false;
    const readiness = await checkClaudeAgentReadiness(
      parseClaudeAgentConfig({
        ANTHROPIC_AUTH_TOKEN: "test-token",
        AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
      {
        connectToolbox: async () => ({
          close: async () => {
            closed = true;
          },
          listTools: async () => ({
            tools: [
              { name: "summarize-ecommerce-sales-by-day" },
              { name: "summarize-ecommerce-sales-by-channel" },
              { name: "summarize_sales_by_region" },
              { name: "summarize_sales_by_customer_segment" },
            ],
          }),
        }),
      },
    );

    expect(readiness).toMatchObject({ status: "ok" });
    expect(closed).toBe(true);
  });

  it("reports an incomplete Toolbox capability profile as not ready", async () => {
    await expect(
      checkClaudeAgentReadiness(
        parseClaudeAgentConfig({
          ANTHROPIC_AUTH_TOKEN: "test-token",
          AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
          TOOLBOX_URL: "http://toolbox:15000",
        }),
        {
          connectToolbox: async () => ({
            close: async () => undefined,
            listTools: async () => ({ tools: [] }),
          }),
        },
      ),
    ).resolves.toMatchObject({ status: "error" });
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
          cwd: claudeProjectRoot,
          includePartialMessages: true,
          maxTurns: defaultClaudeAgentMaxTurns,
          permissionMode: "dontAsk",
          persistSession: false,
          settingSources: ["project"],
          skills: [],
          tools: ["AskUserQuestion"],
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

  it("keeps only the latest cumulative text snapshot in the terminal result", async () => {
    const chunk = "x".repeat(512);
    const output = chunk.repeat(256);

    const result = await runClaudeAgent(
      { prompt: "Stream a long reply" },
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
                session_id: "claude-session-long",
                type: "stream_event",
                uuid: "partial-start",
              } as unknown as SDKMessage;
              for (let index = 0; index < 256; index += 1) {
                yield {
                  event: {
                    delta: { text: chunk, type: "text_delta" },
                    index: 0,
                    type: "content_block_delta",
                  },
                  parent_tool_use_id: null,
                  session_id: "claude-session-long",
                  type: "stream_event",
                  uuid: `partial-${index}`,
                } as unknown as SDKMessage;
              }
              yield {
                duration_api_ms: 0,
                duration_ms: 0,
                is_error: false,
                modelUsage: {},
                num_turns: 1,
                permission_denials: [],
                result: output,
                session_id: "claude-session-long",
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

    expect(result).toMatchObject({
      status: "completed",
      events: [
        { kind: "text", text: output },
        { kind: "done", result: output },
      ],
    });
  });

  it("connects Claude directly to the Toolbox MCP server", async () => {
    const calls: unknown[] = [];
    const abortController = new AbortController();

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
          abortController,
          loadSdk: async () => ({
            ...createFakeSemanticSdkFactories(),
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
                  message: {
                    content: [
                      {
                        content: "Found 1 run",
                        tool_use_id: "toolu-1",
                        type: "tool_result",
                      },
                    ],
                    role: "user",
                  },
                  parent_tool_use_id: null,
                  session_id: "claude-session-1",
                  type: "user",
                  uuid: "user-tool-result-1",
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
          callId: "toolu-1",
          input: { limit: 3 },
          kind: "tool-call",
          toolName: "mcp__toolbox__list-agent-runs",
        },
        {
          callId: "toolu-1",
          kind: "tool-result",
          toolName: "mcp__toolbox__list-agent-runs",
        },
        { kind: "done", result: "Found recent runs" },
      ],
      status: "completed",
    });

    const options = (
      calls[0] as {
        options: {
          allowedTools: string[];
          abortController: AbortController;
          disallowedTools: string[];
          env: Record<string, string | undefined>;
          mcpServers: Record<string, unknown>;
          skills: string[];
        };
      }
    ).options;
    expect(options.abortController).toBe(abortController);
    expect(options.allowedTools).toHaveLength(
      toolboxCapabilityProfiles["platform-observability"].length + 2,
    );
    expect(options.allowedTools).toContain("AskUserQuestion");
    expect(options.skills).toEqual(
      toolboxBusinessCapabilityPacks.map((pack) => pack.name),
    );
    expect(options.allowedTools).toContain("mcp__toolbox__list-agent-runs");
    expect(options.allowedTools).toContain(
      "mcp__semantic_query__query_business_data",
    );
    expect(options.allowedTools).not.toContain(
      "mcp__toolbox__summarize-ecommerce-sales-by-day",
    );
    expect(options.disallowedTools).toContain(
      "mcp__toolbox__summarize-ecommerce-sales-by-day",
    );
    expect(options.disallowedTools).not.toContain(
      "mcp__toolbox__list-agent-runs",
    );
    expect(options.mcpServers).toMatchObject({
      semantic_query: { type: "sdk" },
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
          ...createFakeSemanticSdkFactories(),
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
          disallowedTools: string[];
          env: Record<string, string | undefined>;
          mcpServers: {
            semantic_query: { type: string };
            toolbox?: unknown;
          };
          skills: string[];
        };
      }
    ).options;

    expect(options.allowedTools).toEqual([
      "AskUserQuestion",
      "mcp__semantic_query__query_business_data",
    ]);
    expect(options.disallowedTools).toEqual(
      expect.arrayContaining([
        "mcp__toolbox__summarize-ecommerce-sales-by-day",
      ]),
    );
    expect(options.skills).toEqual(["ecommerce-sales-analysis"]);
    expect(options.mcpServers.semantic_query).toMatchObject({ type: "sdk" });
    expect(options.mcpServers).not.toHaveProperty("toolbox");
    expect(options.env).not.toHaveProperty("TOOLBOX_AUTH_TOKEN");
  });

  it("projects semantic query results as metadata-only run events", async () => {
    const result = await runClaudeAgent(
      { prompt: "最近7天 GMV 趋势" },
      parseClaudeAgentConfig({
        AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
        ANTHROPIC_AUTH_TOKEN: "test-token",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
      {
        loadSdk: async () => ({
          ...createFakeSemanticSdkFactories(),
          query() {
            return (async function* () {
              yield {
                message: {
                  content: [
                    {
                      id: "semantic-call-1",
                      input: {
                        question: "最近7天 GMV 趋势",
                        catalog: "ecommerce-retail-example",
                        intent: "sales_trend",
                        terms: ["gross_sales"],
                        timeExpression: "最近7天",
                      },
                      name: "mcp__semantic_query__query_business_data",
                      type: "tool_use",
                    },
                  ],
                  role: "assistant",
                },
                parent_tool_use_id: null,
                session_id: "claude-session-semantic",
                type: "assistant",
              } as unknown as SDKMessage;
              yield {
                message: {
                  content: [
                    {
                      content: JSON.stringify({
                        type: "result",
                        queryId: "sq_sales_1",
                        planHash: "a".repeat(64),
                        rowCount: 1,
                        data: [{ grossSales: 42 }],
                        plan: {
                          catalog: "ecommerce-retail-example",
                          catalogVersion: 1,
                          contract: "daily_sales_summary",
                          tool: "summarize-ecommerce-sales-by-day",
                        },
                      }),
                      tool_use_id: "semantic-call-1",
                      type: "tool_result",
                    },
                  ],
                  role: "user",
                },
                parent_tool_use_id: null,
                session_id: "claude-session-semantic",
                type: "user",
                uuid: "semantic-result-1",
              } as unknown as SDKMessage;
              yield {
                duration_api_ms: 0,
                duration_ms: 0,
                is_error: false,
                modelUsage: {},
                num_turns: 1,
                permission_denials: [],
                result: "最近7天 GMV 为 42。",
                session_id: "claude-session-semantic",
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

    expect(result).toMatchObject({
      status: "completed",
      events: [
        { kind: "tool-call", callId: "semantic-call-1" },
        { kind: "tool-result", callId: "semantic-call-1" },
        {
          kind: "semantic-query",
          callId: "semantic-call-1",
          status: "result",
          queryId: "sq_sales_1",
          catalog: "ecommerce-retail-example",
          catalogVersion: 1,
          contractId: "daily_sales_summary",
          toolName: "summarize-ecommerce-sales-by-day",
          planHash: "a".repeat(64),
          rowCount: 1,
        },
        { kind: "done", result: "最近7天 GMV 为 42。" },
      ],
    });
    const semanticEvent =
      result.status === "completed"
        ? result.events.find((event) => event.kind === "semantic-query")
        : undefined;
    expect(semanticEvent).not.toHaveProperty("data");
  });

  it("defers AskUserQuestion and resumes it with platform input", async () => {
    const toolInput = {
      questions: [
        {
          question: "是否排除内部测试订单？",
          header: "数据范围",
          multiSelect: false,
          options: [
            { label: "排除并继续", description: "过滤测试账号" },
            { label: "保留", description: "保留全部订单" },
          ],
        },
      ],
    };
    const pendingInput = {
      toolUseId: "toolu-question-1",
      toolName: "AskUserQuestion",
      toolInput,
      requests: [
        {
          requestId: "toolu-question-1:0",
          type: "question" as const,
          prompt: "是否排除内部测试订单？",
          options: [
            { id: "0", label: "排除并继续", style: "primary" as const },
            { id: "1", label: "保留" },
          ],
          action: {
            callId: "toolu-question-1",
            toolName: "AskUserQuestion",
            input: toolInput,
          },
        },
      ],
    };

    await expect(
      runClaudeAgent(
        { prompt: "分析退款异常" },
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
                  deferred_tool_use: {
                    id: pendingInput.toolUseId,
                    input: pendingInput.toolInput,
                    name: pendingInput.toolName,
                  },
                  duration_api_ms: 0,
                  duration_ms: 0,
                  is_error: false,
                  modelUsage: {},
                  num_turns: 1,
                  permission_denials: [],
                  result: "",
                  session_id: "claude-session-waiting",
                  stop_reason: "tool_deferred",
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
      status: "waiting",
      sessionId: "claude-session-waiting",
      events: [
        {
          kind: "input-request",
          request: {
            requestId: "toolu-question-1:0",
            prompt: "是否排除内部测试订单？",
          },
        },
      ],
    });

    let hookDecision: unknown;
    await expect(
      runClaudeAgent(
        {
          prompt: "排除并继续",
          inputResponses: [{ requestId: "toolu-question-1:0", optionId: "0" }],
        },
        {
          authToken: "test-token",
          baseUrl: defaultAnthropicBaseUrl,
          model: "kimi-for-coding",
        },
        {
          pendingInput,
          resumeSessionId: "claude-session-waiting",
          loadSdk: async () => ({
            query(params) {
              const hook = (
                params.options?.hooks as {
                  PreToolUse: Array<{
                    hooks: Array<(input: unknown) => Promise<unknown>>;
                  }>;
                }
              ).PreToolUse[0]?.hooks[0];
              return (async function* () {
                hookDecision = await hook?.({
                  hook_event_name: "PreToolUse",
                  tool_name: "AskUserQuestion",
                  tool_input: pendingInput.toolInput,
                  tool_use_id: pendingInput.toolUseId,
                });
                yield {
                  duration_api_ms: 0,
                  duration_ms: 0,
                  is_error: false,
                  modelUsage: {},
                  num_turns: 1,
                  permission_denials: [],
                  result: "已排除测试订单",
                  session_id: "claude-session-waiting",
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
      status: "completed",
      output: "已排除测试订单",
    });
    expect(hookDecision).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: {
          answers: { "是否排除内部测试订单？": "排除并继续" },
        },
      },
    });
  });
});
