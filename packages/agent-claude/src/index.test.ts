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

  it("uses project Claude Code files instead of inline Toolbox MCP config", async () => {
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
      output: "Found recent runs",
      status: "completed",
    });

    expect(calls).toMatchObject([
      {
        options: {
          allowedTools: [
            "mcp__toolbox__get-template-event",
            "mcp__toolbox__list-agent-runs",
            "mcp__toolbox__list-agent-run-timeline",
            "mcp__toolbox__list-template-events",
          ],
          cwd: expect.any(String),
          includePartialMessages: true,
          env: {
            TOOLBOX_TOOLSET: "agent_template_read_model",
            TOOLBOX_URL: "http://toolbox:15000",
          },
        },
      },
    ]);
    expect(
      (calls[0] as { options: Record<string, unknown> }).options,
    ).not.toHaveProperty("mcpServers");
  });
});
