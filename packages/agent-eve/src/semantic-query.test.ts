import { describe, expect, it, vi } from "vitest";
import { parseToolboxAgentConfig } from "@agent-template/toolbox-config";
import {
  createEveSemanticQueryRuntime,
  createEveToolboxExecutor,
  EveSemanticQueryToolInputSchema,
  isEveSemanticQueryEnabled,
} from "../agent/lib/semantic-query.js";

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
      resultFields: ["grossSales"],
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

const businessEnv = {
  AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
  TOOLBOX_URL: "http://toolbox:15000",
};

describe("Eve semantic query Tool", () => {
  it("exposes only the governed model input fields", () => {
    expect(Object.keys(EveSemanticQueryToolInputSchema.shape).sort()).toEqual([
      "catalog",
      "intent",
      "question",
      "terms",
      "timeExpression",
    ]);
    expect(() =>
      EveSemanticQueryToolInputSchema.parse({
        question: "本月 GMV",
        sql: "select * from orders",
      }),
    ).toThrow();
  });

  it("enables the runtime-local Tool only for profiles with semantic catalogs", () => {
    expect(isEveSemanticQueryEnabled(businessEnv)).toBe(true);
    expect(
      isEveSemanticQueryEnabled({
        AGENT_CAPABILITY_PROFILE: "platform-observability",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toBe(false);
    expect(
      createEveSemanticQueryRuntime(
        {
          AGENT_CAPABILITY_PROFILE: "platform-observability",
          TOOLBOX_URL: "http://toolbox:15000",
        },
        { catalogs: [salesCatalog] },
      ),
    ).toBeUndefined();
  });

  it("delegates a certified plan to an injectable executor", async () => {
    const executeTool = vi.fn(async () => [{ grossSales: 42 }]);
    const clock = [100, 117];
    const runtime = createEveSemanticQueryRuntime(businessEnv, {
      catalogs: [salesCatalog],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
      nowMs: () => clock.shift() ?? 117,
    });

    await expect(
      runtime?.query({
        question: "最近7天 GMV 趋势",
        catalog: "ecommerce-retail-example",
        intent: "sales_trend",
        terms: ["gross_sales"],
        timeExpression: "最近7天",
      }),
    ).resolves.toMatchObject({
      type: "result",
      rowCount: 1,
      data: [{ grossSales: 42 }],
      durationMs: 17,
    });
    expect(executeTool).toHaveBeenCalledWith(
      "summarize-ecommerce-sales-by-day",
      {
        from: "2026-07-05T08:00:00.000Z",
        to: "2026-07-12T08:00:00.000Z",
      },
      { signal: undefined },
    );
  });

  it("preserves semantic query correlation when the executor fails", async () => {
    const databaseError = new Error("database down");
    const runtime = createEveSemanticQueryRuntime(businessEnv, {
      catalogs: [salesCatalog],
      executeTool: vi.fn(async () => {
        throw databaseError;
      }),
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      runtime?.query({
        question: "最近7天 GMV 趋势",
        catalog: "ecommerce-retail-example",
        intent: "sales_trend",
        terms: ["gross_sales"],
        timeExpression: "最近7天",
      }),
    ).rejects.toMatchObject({
      name: "SemanticQueryExecutionError",
      planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      queryId: expect.stringMatching(/^sq_/),
      stage: "tool_execution",
      tool: "summarize-ecommerce-sales-by-day",
      cause: databaseError,
    });
  });

  it("executes through an injectable MCP Client and always closes it", async () => {
    const config = parseToolboxAgentConfig({
      ...businessEnv,
      TOOLBOX_AUTH_TOKEN: "toolbox-token",
    });
    expect(config).toBeDefined();

    const connect = vi.fn(async () => undefined);
    const callTool = vi.fn(async () => ({
      content: [
        { type: "text" as const, text: JSON.stringify({ grossSales: 42 }) },
      ],
    }));
    const close = vi.fn(async () => undefined);
    const executor = createEveToolboxExecutor(config!, {
      createClient: () => ({ connect, callTool, close }),
    });
    const abortController = new AbortController();

    await expect(
      executor(
        "summarize-ecommerce-sales-by-day",
        { from: "2026-07-01T00:00:00.000Z" },
        { signal: abortController.signal },
      ),
    ).resolves.toEqual([{ grossSales: 42 }]);
    expect(connect).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith(
      {
        name: "summarize-ecommerce-sales-by-day",
        arguments: { from: "2026-07-01T00:00:00.000Z" },
      },
      undefined,
      { signal: abortController.signal },
    );
    expect(close).toHaveBeenCalledOnce();

    callTool.mockRejectedValueOnce(new Error("Toolbox unavailable"));
    await expect(
      executor("summarize-ecommerce-sales-by-day", {}),
    ).rejects.toThrow("Toolbox unavailable");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("preserves execution and close failures without throwing from finally", async () => {
    const config = parseToolboxAgentConfig({
      ...businessEnv,
      TOOLBOX_AUTH_TOKEN: "toolbox-token",
    });
    const executionError = new Error("Toolbox unavailable");
    const closeError = new Error("MCP close failed");
    const executor = createEveToolboxExecutor(config!, {
      createClient: () => ({
        connect: vi.fn(async () => undefined),
        callTool: vi.fn(async () => {
          throw executionError;
        }),
        close: vi.fn(async () => {
          throw closeError;
        }),
      }),
    });

    const promise = executor("summarize-ecommerce-sales-by-day", {});
    await expect(promise).rejects.toBeInstanceOf(AggregateError);
    await expect(promise).rejects.toMatchObject({
      errors: [executionError, closeError],
    });
  });
});
