import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  defaultEveAgentModel,
  eveAgentDirectory,
  getEveAgentRuntimeStateFromEnv,
  parseEveAgentConfig,
  readEveAnthropicBaseURL,
  readEveAgentModel,
  runEveAgent,
} from "./index.js";

describe("Eve Agent runtime", () => {
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

  it("depends on the latest official eve package", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.eve).toBe("latest");
  });

  it("loads the authored surface through eve defineAgent", async () => {
    const agent = (await import("../agent/agent")).default as {
      model?: { modelId?: string };
    };

    expect(agent.model?.modelId).toBe(defaultEveAgentModel);
  });

  it("exposes Toolbox through Host-managed Eve authored tools", async () => {
    const listAgentRuns = (await import("../agent/tools/list_agent_runs"))
      .default as { description?: string };
    const getEcommerceOrderDetail = (
      await import("../agent/tools/get_ecommerce_order_detail")
    ).default as { description?: string };
    const getAgentRunSummary = (
      await import("../agent/tools/get_agent_run_summary")
    ).default as { description?: string };
    const listAgentRunTimeline = (
      await import("../agent/tools/list_agent_run_timeline")
    ).default as { description?: string };
    const listFailedAgentRunsInWindow = (
      await import("../agent/tools/list_failed_agent_runs_in_window")
    ).default as { description?: string };
    const listEcommerceFulfillmentExceptions = (
      await import("../agent/tools/list_ecommerce_fulfillment_exceptions")
    ).default as { description?: string };
    const listEcommerceOrdersInWindow = (
      await import("../agent/tools/list_ecommerce_orders_in_window")
    ).default as { description?: string };
    const listEcommerceTopProducts = (
      await import("../agent/tools/list_ecommerce_top_products")
    ).default as { description?: string };
    const listTemplateEvents = (
      await import("../agent/tools/list_template_events")
    ).default as { description?: string };
    const listTemplateEventsInWindow = (
      await import("../agent/tools/list_template_events_in_window")
    ).default as { description?: string };
    const summarizeTemplateEventsByType = (
      await import("../agent/tools/summarize_template_events_by_type")
    ).default as { description?: string };
    const summarizeToolInvocations = (
      await import("../agent/tools/summarize_tool_invocations")
    ).default as { description?: string };
    const summarizeEcommerceSalesByChannel = (
      await import("../agent/tools/summarize_ecommerce_sales_by_channel")
    ).default as { description?: string };
    const summarizeEcommerceSalesByDay = (
      await import("../agent/tools/summarize_ecommerce_sales_by_day")
    ).default as { description?: string };
    const getTemplateEvent = (await import("../agent/tools/get_template_event"))
      .default as { description?: string };

    expect(listAgentRuns.description).toContain("Host-managed Toolbox");
    expect(getEcommerceOrderDetail.description).toContain(
      "synthetic ecommerce",
    );
    expect(getAgentRunSummary.description).toContain("Host-managed Toolbox");
    expect(listAgentRunTimeline.description).toContain("Host-managed Toolbox");
    expect(listFailedAgentRunsInWindow.description).toContain(
      "Host-managed Toolbox",
    );
    expect(listEcommerceFulfillmentExceptions.description).toContain(
      "synthetic ecommerce",
    );
    expect(listEcommerceOrdersInWindow.description).toContain(
      "synthetic ecommerce",
    );
    expect(listEcommerceTopProducts.description).toContain(
      "synthetic ecommerce",
    );
    expect(listTemplateEvents.description).toContain("Host-managed Toolbox");
    expect(listTemplateEventsInWindow.description).toContain(
      "Host-managed Toolbox",
    );
    expect(summarizeTemplateEventsByType.description).toContain(
      "Host-managed Toolbox",
    );
    expect(summarizeToolInvocations.description).toContain("MCP Toolbox");
    expect(summarizeEcommerceSalesByChannel.description).toContain(
      "synthetic ecommerce",
    );
    expect(summarizeEcommerceSalesByDay.description).toContain(
      "synthetic ecommerce",
    );
    expect(getTemplateEvent.description).toContain("Host-managed Toolbox");
    expect(
      existsSync(new URL("../agent/connections/toolbox.ts", import.meta.url)),
    ).toBe(false);
  });

  it("defines the Eve channel route auth in the authored surface", async () => {
    const channel = (await import("../agent/channels/eve")).default as {
      routes?: readonly unknown[];
    };

    expect(Array.isArray(channel.routes)).toBe(true);
  });

  it("disables Eve provider-managed web search for Kimi compatibility", async () => {
    const webSearch = (await import("../agent/tools/web_search")).default as {
      kind?: string;
    };

    expect(webSearch.kind).toBe("eve:disabled-tool");
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

    await expect(
      runEveAgent(
        { prompt: "Summarize this template" },
        parseEveAgentConfig({ EVE_AGENT_HOST: "http://eve.local" }),
        {
          createClient: () => ({
            session: () => ({
              send: async () => ({
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
              }),
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
          kind: "tool-call",
          tool: "toolbox__list-agent-runs",
          input: '{"limit":1}',
        },
        { kind: "tool-result", tool: "toolbox__list-agent-runs" },
        { kind: "text", text: "Do" },
        { kind: "text", text: "Done" },
        { kind: "done", result: "Done" },
      ],
      output: "Done",
      sessionId: "eve-session-1",
    });
    expect(events).toEqual([
      {
        kind: "tool-call",
        tool: "toolbox__list-agent-runs",
        input: '{"limit":1}',
      },
      { kind: "tool-result", tool: "toolbox__list-agent-runs" },
      { kind: "text", text: "Do" },
      { kind: "text", text: "Done" },
      { kind: "done", result: "Done" },
    ]);
  });
});
