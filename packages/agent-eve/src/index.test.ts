import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  checkEveAgentReadiness,
  defaultEveAgentModel,
  eveAgentDirectory,
  getEveAgentRuntimeStateFromEnv,
  parseEveAgentConfig,
  readEveAnthropicBaseURL,
  readEveAgentModel,
  runEveAgent,
} from "./index.js";

describe("Eve Agent runtime", () => {
  it("installs the Toolbox business skills in the authored surface", () => {
    const skillNames = [
      "ecommerce-sales-analysis",
      "ecommerce-product-analysis",
      "ecommerce-order-operations",
      "ecommerce-fulfillment-operations",
    ];

    for (const skillName of skillNames) {
      const skill = readFileSync(
        new URL(`../agent/skills/${skillName}.ts`, import.meta.url),
        "utf8",
      );

      expect(skill).toContain("defineDynamic");
      expect(skill).toContain("hasToolboxCapabilities(requiredTools)");
      expect(skill).toContain("Toolbox MCP");
      expect(skill).toContain("Business semantic catalog");
      expect(skill).toContain("### `toolbox__");
      expect(skill).toContain("ecommerceSemanticCatalog");
    }

    expect(
      readFileSync(
        new URL("../agent/lib/ecommerce-semantic-catalog.ts", import.meta.url),
        "utf8",
      ),
    ).toContain("kind: business-semantic-catalog");
  });

  it("points at the package-local authored surface", () => {
    const state = getEveAgentRuntimeStateFromEnv({});

    expect(state.configured).toBe(false);
    expect(state.authoredSurface).toBe(eveAgentDirectory);
  });

  it("is configured when the Eve Agent host is set", () => {
    const config = parseEveAgentConfig({
      EVE_AGENT_HOST: "http://127.0.0.1:13000",
      EVE_AGENT_SERVICE_TOKEN: "service-token",
    });
    const state = getEveAgentRuntimeStateFromEnv({
      EVE_AGENT_HOST: "http://127.0.0.1:13000",
    });

    expect(config.serviceToken).toBe("service-token");
    expect(state.configured).toBe(true);
    expect(state.host).toBe("http://127.0.0.1:13000");
  });

  it("uses the official Eve Client health contract for readiness", async () => {
    await expect(
      checkEveAgentReadiness(
        parseEveAgentConfig({ EVE_AGENT_HOST: "http://eve.local" }),
        {
          createClient: () => ({
            health: async () => ({
              ok: true,
              status: "ready",
              workflowId: "workflow-1",
            }),
          }),
        },
      ),
    ).resolves.toEqual({
      status: "ok",
      message: "Eve runtime 已就绪（workflow: workflow-1）",
    });
  });

  it("depends on the latest official eve package", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      engines?: Record<string, string>;
    };

    expect(packageJson.dependencies?.eve).toBe("latest");
    expect(packageJson.dependencies?.["just-bash"]).toBe("^3.0.1");
    expect(packageJson.dependencies?.microsandbox).toBeUndefined();
    expect(packageJson.engines?.node).toBe("24.x");
  });

  it("pins the portable official sandbox backend for the read-only harness", async () => {
    const sandbox = (await import("../agent/sandbox")).default as {
      backend?: { name?: string };
    };

    expect(sandbox.backend?.name).toBe("just-bash");
  });

  it("keeps always-on instructions focused on stable runtime behavior", () => {
    const instructions = readFileSync(
      new URL("../agent/instructions.md", import.meta.url),
      "utf8",
    );

    expect(instructions).toContain("默认使用中文");
    expect(instructions).toContain("Toolbox");
    expect(instructions).not.toContain("add tools");
  });

  it("loads the authored surface through eve defineAgent", async () => {
    const agent = (await import("../agent/agent")).default as {
      model?: { modelId?: string };
    };

    expect(agent.model?.modelId).toBe(defaultEveAgentModel);
  });

  it("owns the Toolbox MCP client through an Eve connection", async () => {
    const toolbox = (await import("../agent/connections/toolbox")).default as {
      url?: string;
      tools?: { allow?: string[] };
    };

    expect(toolbox.url).toBe("http://localhost:15000/mcp");
    expect(toolbox.tools?.allow).toHaveLength(18);
    expect(toolbox.tools?.allow).toContain("summarize_sales_by_region");
    expect(
      existsSync(new URL("../agent/tools/toolbox.ts", import.meta.url)),
    ).toBe(false);
  });

  it("defines the Eve channel route auth in the authored surface", async () => {
    const channel = (await import("../agent/channels/eve")).default as {
      routes?: readonly unknown[];
    };

    expect(Array.isArray(channel.routes)).toBe(true);
  });

  it("disables unneeded privileged default harness tools", async () => {
    const disabledTools = await Promise.all([
      import("../agent/tools/bash"),
      import("../agent/tools/web_fetch"),
      import("../agent/tools/web_search"),
      import("../agent/tools/write_file"),
    ]);

    for (const tool of disabledTools) {
      expect((tool.default as { kind?: string }).kind).toBe(
        "eve:disabled-tool",
      );
    }
  });

  it("uses one model source for runtime state and authored surface", () => {
    const env = { ANTHROPIC_MODEL: "kimi-custom" };

    expect(getEveAgentRuntimeStateFromEnv(env).model).toBe(
      readEveAgentModel(env),
    );
  });

  it("normalizes Anthropic-compatible base URL for the AI SDK provider", () => {
    expect(
      readEveAnthropicBaseURL({
        ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
      }),
    ).toBe("https://api.kimi.com/coding/v1");
    expect(
      readEveAnthropicBaseURL({
        ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/v1",
      }),
    ).toBe("https://api.kimi.com/coding/v1");
  });

  it("skips execution until an Eve Agent host is configured", async () => {
    await expect(
      runEveAgent(
        { prompt: "Summarize this template" },
        parseEveAgentConfig({}),
      ),
    ).resolves.toEqual({
      status: "skipped",
      reason: "EVE_AGENT_HOST is not configured",
    });
  });

  it("runs through the Eve client when configured", async () => {
    const events: unknown[] = [];
    const sent: unknown[] = [];
    const abortController = new AbortController();

    await expect(
      runEveAgent(
        { prompt: "Summarize this template" },
        parseEveAgentConfig({ EVE_AGENT_HOST: "http://eve.local" }),
        {
          abortController,
          createClient: () => ({
            session: () => ({
              state: {
                continuationToken: "continuation-1",
                sessionId: "eve-session-1",
                streamIndex: 4,
              },
              send: async (input) => {
                sent.push(input);
                return {
                  sessionId: "eve-session-1",
                  async *[Symbol.asyncIterator]() {
                    yield {
                      data: {
                        actions: [
                          {
                            callId: "call-1",
                            input: { limit: 1 },
                            kind: "tool-call",
                            toolName: "toolbox__list-agent-runs",
                          },
                        ],
                        sequence: 1,
                        stepIndex: 0,
                        turnId: "turn-1",
                      },
                      type: "actions.requested",
                    };
                    yield {
                      data: {
                        result: {
                          callId: "call-1",
                          kind: "tool-result",
                          output: [{ runId: "run-1" }],
                          toolName: "toolbox__list-agent-runs",
                        },
                        sequence: 2,
                        status: "completed",
                        stepIndex: 0,
                        turnId: "turn-1",
                      },
                      type: "action.result",
                    };
                    yield {
                      data: {
                        messageSoFar: "Do",
                        sequence: 3,
                        stepIndex: 0,
                        turnId: "turn-1",
                      },
                      type: "message.appended",
                    };
                    yield {
                      data: {
                        finishReason: "stop",
                        message: "Done",
                        sequence: 4,
                        stepIndex: 0,
                        turnId: "turn-1",
                      },
                      type: "message.completed",
                    };
                  },
                };
              },
            }),
          }),
          onEvent(event) {
            events.push(event);
          },
        },
      ),
    ).resolves.toEqual({
      status: "completed",
      events: [
        {
          callId: "call-1",
          kind: "tool-call",
          toolName: "toolbox__list-agent-runs",
          input: { limit: 1 },
        },
        {
          callId: "call-1",
          kind: "tool-result",
          toolName: "toolbox__list-agent-runs",
        },
        { kind: "text", text: "Do" },
        { kind: "text", text: "Done" },
        { kind: "done", result: "Done" },
      ],
      output: "Done",
      sessionId: "eve-session-1",
      sessionState: {
        continuationToken: "continuation-1",
        sessionId: "eve-session-1",
        streamIndex: 4,
      },
    });
    expect(events).toEqual([
      {
        callId: "call-1",
        kind: "tool-call",
        toolName: "toolbox__list-agent-runs",
        input: { limit: 1 },
      },
      {
        callId: "call-1",
        kind: "tool-result",
        toolName: "toolbox__list-agent-runs",
      },
      { kind: "text", text: "Do" },
      { kind: "text", text: "Done" },
      { kind: "done", result: "Done" },
    ]);
    expect(sent).toEqual([
      {
        message: "Summarize this template",
        signal: abortController.signal,
      },
    ]);
  });
});
