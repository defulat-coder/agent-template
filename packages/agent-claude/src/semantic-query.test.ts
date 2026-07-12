import { describe, expect, it, vi } from "vitest";
import type {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { parseClaudeAgentConfig } from "./index.js";
import {
  ClaudeSemanticQueryToolInputSchema,
  createClaudeSemanticQueryMcpServer,
  readClaudeSemanticQueryEvent,
  type ClaudeSemanticQueryToolHandler,
} from "./semantic-query.js";

const salesCatalog = {
  kind: "business-semantic-catalog",
  name: "ecommerce-retail-example",
  version: 1,
  databaseSchema: "fixture",
  metrics: [
    {
      id: "gross_sales",
      labels: ["GMV"],
      resultField: "grossSales",
      tools: ["summarize-ecommerce-sales-by-day"],
    },
  ],
  dimensions: [
    {
      id: "payment_day",
      labels: ["付款日"],
      field: "Order.paidAt",
    },
  ],
  queryContracts: [
    {
      id: "daily_sales_summary",
      tool: "summarize-ecommerce-sales-by-day",
      metrics: ["gross_sales"],
      dimensions: ["payment_day"],
      resultFields: [
        "salesDate",
        "paidOrderCount",
        "buyerCount",
        "grossSales",
        "refundAmount",
        "netSales",
      ],
      limitations: ["净销售额不是会计收入。"],
    },
  ],
  questionPatterns: [
    {
      id: "sales_trend",
      examples: ["最近7天 GMV 趋势"],
      tool: "summarize-ecommerce-sales-by-day",
      contract: "daily_sales_summary",
      required: ["time_window"],
    },
  ],
};

describe("Claude semantic query MCP Tool", () => {
  it("exposes only the five governed proposal fields", () => {
    expect(new Set(Object.keys(ClaudeSemanticQueryToolInputSchema.shape))).toEqual(
      new Set(["question", "catalog", "intent", "terms", "timeExpression"]),
    );
    expect(
      ClaudeSemanticQueryToolInputSchema.safeParse({
        question: "本月 GMV",
        tool: "summarize-ecommerce-sales-by-day",
        sql: "select * from orders",
        identity: "admin",
      }).success,
    ).toBe(false);
  });

  it("projects only semantic provenance metadata and requires queryId", () => {
    const event = readClaudeSemanticQueryEvent(
      "semantic-call-1",
      [
        {
          type: "text",
          text: JSON.stringify({
            type: "result",
            queryId: "sq_sales_1",
            planHash: "a".repeat(64),
            rowCount: 1,
            durationMs: 12,
            data: [{ grossSales: 42 }],
            plan: {
              catalog: "ecommerce-retail-example",
              catalogVersion: 1,
              contract: "daily_sales_summary",
              tool: "summarize-ecommerce-sales-by-day",
            },
          }),
        },
      ],
    );

    expect(event).toEqual({
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
      durationMs: 12,
    });
    expect(event).not.toHaveProperty("data");
    expect(() =>
      readClaudeSemanticQueryEvent(
        "semantic-call-missing-id",
        JSON.stringify({ type: "clarification" }),
      ),
    ).toThrow("is missing queryId");
  });

  it("executes one certified Toolbox Tool and closes its runtime-owned MCP Client", async () => {
    const harness = createHarness({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            salesDate: "2026-07-11",
            paidOrderCount: 3,
            buyerCount: 2,
            grossSales: 42,
            refundAmount: 2,
            netSales: 40,
          }),
        },
      ],
    });

    expect(harness.createServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "semantic_query" }),
    );
    expect(harness.defineTool).toHaveBeenCalledWith(
      "query_business_data",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
      expect.any(Object),
    );
    expect(harness.handler).toBeTypeOf("function");

    const result = await harness.handler({
      question: "最近7天 GMV 趋势",
      catalog: "ecommerce-retail-example",
      intent: "sales_trend",
      terms: ["gross_sales"],
      timeExpression: "最近7天",
    });

    expect(harness.callTool).toHaveBeenCalledWith(
      {
        name: "summarize-ecommerce-sales-by-day",
        arguments: {
          from: "2026-07-05T08:00:00.000Z",
          to: "2026-07-12T08:00:00.000Z",
        },
      },
      undefined,
      {},
    );
    expect(harness.connectToolbox).toHaveBeenCalledWith(
      expect.objectContaining({ authorizationToken: "toolbox-token" }),
      undefined,
    );
    expect(result).toMatchObject({
      structuredContent: {
        type: "result",
        rowCount: 1,
        data: [{ grossSales: 42, refundAmount: 2, netSales: 40 }],
      },
    });
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "an MCP error",
      { isError: true, content: [{ type: "text", text: "permission denied" }] },
      /Certified Toolbox Tool .* failed/u,
    ],
    [
      "non-JSON content",
      { content: [{ type: "text", text: "not-json" }] },
      /returned invalid JSON/u,
    ],
  ])("fails explicitly on %s and still closes the MCP Client", async (_, response, expected) => {
    const harness = createHarness(response);

    await expect(
      harness.handler({
        question: "最近7天 GMV 趋势",
        catalog: "ecommerce-retail-example",
        intent: "sales_trend",
        terms: ["gross_sales"],
        timeExpression: "最近7天",
      }),
    ).rejects.toThrow(expected);
    expect(harness.close).toHaveBeenCalledOnce();
  });
});

function createHarness(toolResult: unknown) {
  let handler: ClaudeSemanticQueryToolHandler | undefined;
  const close = vi.fn(async () => undefined);
  const callTool = vi.fn(async () => toolResult);
  const connectToolbox = vi.fn(async () => ({ callTool, close }));
  const defineTool = vi.fn(
    (
      name: string,
      _description: string,
      _inputSchema: unknown,
      candidate: ClaudeSemanticQueryToolHandler,
    ) => {
      handler = candidate;
      return { name };
    },
  ) as unknown as typeof tool;
  const createServer = vi.fn(
    (input: { name: string; tools: unknown[] }) => ({
      type: "sdk" as const,
      name: input.name,
      instance: {},
    }),
  ) as unknown as typeof createSdkMcpServer;
  const config = parseClaudeAgentConfig({
    AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
    ANTHROPIC_AUTH_TOKEN: "test-token",
    TOOLBOX_AUTH_TOKEN: "toolbox-token",
    TOOLBOX_URL: "http://toolbox:15000",
  });
  if (!config.toolbox) throw new Error("Expected Toolbox test config");

  createClaudeSemanticQueryMcpServer(config.toolbox, {
    catalogs: [salesCatalog],
    connectToolbox,
    createServer,
    defineTool,
    now: () => new Date("2026-07-12T08:00:00.000Z"),
  });
  if (!handler) throw new Error("Expected semantic query Tool handler");
  return {
    callTool,
    close,
    connectToolbox,
    createServer,
    defineTool,
    handler,
  };
}
