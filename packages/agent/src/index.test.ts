import { describe, expect, it } from "vitest";
import {
  checkAgentRuntimeReadinessFromEnv,
  defaultAgentRuntimeName,
  defaultClaudeAgentModel,
  defaultEveAgentModel,
  getAgentRuntimeStateFromEnv,
  parseAgentRuntimeEnv,
  runAgent,
} from "./index.js";

describe("Agent runtime selector", () => {
  it("defaults to the Claude Agent runtime", () => {
    const state = getAgentRuntimeStateFromEnv({});

    expect(state.runtime).toBe(defaultAgentRuntimeName);
    expect(state.configured).toBe(false);
    expect(state.model).toBe(defaultClaudeAgentModel);
  });

  it("selects the Eve Agent runtime from AGENT_RUNTIME", () => {
    const state = getAgentRuntimeStateFromEnv({ AGENT_RUNTIME: "eve" });

    expect(state.runtime).toBe("eve");
    expect(state.configured).toBe(false);
  });

  it("keeps runtime-specific env config behind the Agent runtime env interface", () => {
    expect(parseAgentRuntimeEnv({})).toMatchObject({
      AGENT_RUNTIME: defaultAgentRuntimeName,
      ANTHROPIC_MODEL: defaultClaudeAgentModel,
      CLAUDE_AGENT_MODEL: defaultClaudeAgentModel,
      EVE_AGENT_MODEL: defaultEveAgentModel,
    });

    expect(
      getAgentRuntimeStateFromEnv({
        AGENT_RUNTIME: "eve",
        EVE_AGENT_HOST: "http://127.0.0.1:13000",
        EVE_AGENT_MODEL: "eve-custom",
      }),
    ).toMatchObject({
      runtime: "eve",
      configured: true,
      model: "eve-custom",
    });
  });

  it("checks only the deployment-selected runtime with a bounded timeout", async () => {
    const calls: string[] = [];
    await expect(
      checkAgentRuntimeReadinessFromEnv(
        { AGENT_RUNTIME: "eve", EVE_AGENT_HOST: "http://eve.local" },
        {
          checkClaude: async () => {
            calls.push("claude");
            return { status: "ok", message: "unexpected" };
          },
          checkEve: async () => {
            calls.push("eve");
            return { status: "ok", message: "ready" };
          },
        },
      ),
    ).resolves.toEqual({ status: "ok", message: "ready" });
    expect(calls).toEqual(["eve"]);
  });

  it("turns a hanging runtime probe into an error", async () => {
    await expect(
      checkAgentRuntimeReadinessFromEnv(
        { ANTHROPIC_AUTH_TOKEN: "test-token" },
        {
          checkClaude: async () => new Promise(() => undefined),
          timeoutMs: 5,
        },
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Agent runtime readiness 检查超时",
    });
  });

  it("runs an Agent run through the selected Agent runtime seam", async () => {
    const events: unknown[] = [];

    await expect(
      runAgent(
        {
          prompt: "Summarize this template",
        },
        {
          AGENT_RUNTIME: "eve",
          EVE_AGENT_HOST: "http://127.0.0.1:13000",
          EVE_AGENT_MODEL: "eve-custom",
        },
        {
          runEve: async (_input, _config, options) => {
            options?.onEvent?.({ kind: "text", text: "Working" });

            return {
              status: "completed",
              events: [
                { kind: "text", text: "Working" },
                { kind: "done", result: "Done" },
              ],
              output: "Done",
              sessionId: "eve-session-1",
            };
          },
          onEvent(event) {
            events.push(event);
          },
        },
      ),
    ).resolves.toEqual({
      promptLength: 23,
      runtime: "eve",
      configured: true,
      model: "eve-custom",
      status: "completed",
      events: [
        { kind: "text", text: "Working" },
        { kind: "done", result: "Done" },
      ],
      output: "Done",
      sessionId: "eve-session-1",
    });

    expect(events).toEqual([{ kind: "text", text: "Working" }]);
  });

  it("passes direct Toolbox MCP Client env through to the Claude runtime", async () => {
    await expect(
      runAgent(
        {
          prompt: "List recent agent runs",
        },
        {
          ANTHROPIC_AUTH_TOKEN: "test-token",
          AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
          TOOLBOX_AUTH_TOKEN: "toolbox-token",
          TOOLBOX_URL: "http://toolbox:15000",
        },
        {
          runClaude: async (_input, config) => {
            expect(config).toMatchObject({
              authToken: "test-token",
              toolbox: {
                authorizationToken: "toolbox-token",
                capabilityProfile: "ecommerce-sales",
                url: "http://toolbox:15000/mcp",
              },
            });

            return {
              status: "completed",
              events: [{ kind: "done", result: "Done" }],
              output: "Done",
            };
          },
        },
      ),
    ).resolves.toMatchObject({
      configured: true,
      events: [{ kind: "done", result: "Done" }],
      runtime: "claude",
      status: "completed",
    });
  });

  it("rejects invalid Agent run input at the Agent runtime seam", async () => {
    await expect(runAgent({ prompt: "" }, {})).rejects.toThrow();
  });
});
