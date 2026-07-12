import { describe, expect, it, vi } from "vitest";
import {
  createSemanticQueryEngine,
  SemanticQueryExecutionError,
} from "./index.js";

const catalog = {
  kind: "business-semantic-catalog",
  name: "sales",
  version: 1,
  databaseSchema: "fixture",
  metrics: [
    {
      id: "gross_sales",
      labels: ["GMV", "销售额"],
      resultField: "grossSales",
      tools: ["summarize_sales"],
    },
  ],
  dimensions: [],
  queryContracts: [
    {
      id: "sales_summary",
      tool: "summarize_sales",
      metrics: ["gross_sales"],
      dimensions: [],
      resultFields: ["grossSales"],
      limitations: ["经营指标，不是会计收入。"],
    },
  ],
  ambiguities: [
    { term: "收入", action: "clarify", reason: "请明确经营销售额或会计收入。" },
  ],
  questionPatterns: [
    {
      id: "sales_summary",
      examples: ["本月销售额"],
      tool: "summarize_sales",
      contract: "sales_summary",
      required: ["time_window"],
    },
  ],
};

const filteredCatalog = {
  ...catalog,
  name: "filtered-sales",
  dimensions: [
    {
      id: "sales_channel",
      labels: ["销售渠道", "渠道"],
      field: "EcommerceOrder.channel",
      values: [
        { value: "LIVE_STREAM", labels: ["直播", "直播间"] },
        { value: "WEB", labels: ["网页", "官网"] },
      ],
    },
  ],
  queryContracts: [
    {
      ...catalog.queryContracts[0],
      dimensions: ["sales_channel"],
      parameters: [{ name: "channel" }],
    },
  ],
};

const pagedCatalog = {
  kind: "business-semantic-catalog",
  name: "products",
  version: 1,
  databaseSchema: "fixture",
  metrics: [
    {
      id: "units_sold",
      labels: ["销量"],
      resultField: "unitsSold",
      tools: ["list_products"],
    },
  ],
  dimensions: [{ id: "product", labels: ["商品"], field: "Product.sku" }],
  queryContracts: [
    {
      id: "product_ranking",
      tool: "list_products",
      metrics: ["units_sold"],
      dimensions: ["product"],
      resultFields: ["sku", "unitsSold", "totalCount"],
      limitations: ["结果使用稳定分页。"],
      parameters: [
        { name: "limit", default: 20 },
        { name: "offset", default: 0 },
      ],
    },
  ],
  ambiguities: [],
  questionPatterns: [
    {
      id: "top_products",
      examples: ["近7天商品销量"],
      tool: "list_products",
      contract: "product_ranking",
      required: ["time_window", "limit"],
    },
  ],
};

const orderCatalog = {
  kind: "business-semantic-catalog",
  name: "orders",
  version: 1,
  databaseSchema: "fixture",
  metrics: [],
  dimensions: [
    { id: "order_status", labels: ["订单状态"], field: "Order.status" },
  ],
  queryContracts: [
    {
      id: "order_detail",
      tool: "get_order_detail",
      metrics: [],
      dimensions: ["order_status"],
      resultFields: ["orderNumber", "status"],
      limitations: ["只接受明确订单号。"],
      parameters: [{ name: "orderNumber", required: true }],
    },
  ],
  ambiguities: [],
  questionPatterns: [
    {
      id: "order_detail",
      examples: ["查询订单号 EC20260601001"],
      tool: "get_order_detail",
      contract: "order_detail",
      required: ["order_number"],
    },
  ],
};

describe("semantic query engine", () => {
  it("clarifies an explicit catalog ambiguity without invoking a Tool", async () => {
    const executeTool = vi.fn();
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "本月收入是多少？",
        proposal: { catalog: "sales", intent: "sales_summary", terms: [] },
      }),
    ).resolves.toMatchObject({
      type: "clarification",
      code: "ambiguous_term",
      queryId: expect.stringMatching(
        /^sq_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      term: "收入",
    });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("rejects a contract outside the allowed Tool surface", async () => {
    const executeTool = vi.fn();
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: [],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "本月 GMV 是多少？",
        proposal: {
          catalog: "sales",
          intent: "sales_summary",
          terms: ["gross_sales"],
          timeExpression: "本月",
        },
      }),
    ).resolves.toMatchObject({
      type: "unsupported",
      code: "capability_not_allowed",
      queryId: expect.any(String),
    });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("prunes disallowed catalogs before evaluating their ambiguity rules", async () => {
    const executeTool = vi.fn();
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: [],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "本月收入是多少？",
        proposal: { catalog: "sales", intent: "sales_summary", terms: [] },
      }),
    ).resolves.toMatchObject({
      type: "unsupported",
      code: "capability_not_allowed",
    });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("rejects an explicit disallowed intent in a partly visible catalog", async () => {
    const mixedCatalog = {
      ...catalog,
      dimensions: orderCatalog.dimensions,
      queryContracts: [
        ...catalog.queryContracts,
        ...orderCatalog.queryContracts,
      ],
      questionPatterns: [
        ...catalog.questionPatterns,
        ...orderCatalog.questionPatterns,
      ],
    };
    const executeTool = vi.fn();
    const engine = createSemanticQueryEngine({
      catalogs: [mixedCatalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "查询订单号 EC20260601001 的状态",
        proposal: {
          catalog: "sales",
          intent: "order_detail",
          terms: ["order_status"],
        },
      }),
    ).resolves.toMatchObject({
      type: "unsupported",
      code: "capability_not_allowed",
    });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("executes one certified UTC plan and returns a projected result envelope", async () => {
    const executeTool = vi
      .fn()
      .mockResolvedValue([{ grossSales: 42, internalColumn: "must-not-leak" }]);
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    const result = await engine.query({
      question: "本月 GMV 是多少？",
      proposal: {
        catalog: "sales",
        intent: "sales_summary",
        terms: ["gross_sales"],
        timeExpression: "本月",
      },
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith(
      "summarize_sales",
      {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-12T08:00:00.000Z",
      },
      { signal: undefined },
    );
    expect(result).toMatchObject({
      type: "result",
      queryId: expect.any(String),
      planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      executedAt: "2026-07-12T08:00:00.000Z",
      rowCount: 1,
      truncated: false,
      limitations: ["经营指标，不是会计收入。"],
      data: [{ grossSales: 42 }],
      plan: {
        catalog: "sales",
        catalogVersion: 1,
        intent: "sales_summary",
        contract: "sales_summary",
        tool: "summarize_sales",
        terms: ["gross_sales"],
        arguments: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-12T08:00:00.000Z",
        },
      },
    });
  });

  it.each([
    ["2026-07-01", "2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"],
    ["2026年7月1日", "2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"],
    [
      "2026-07-01 到 2026-07-03",
      "2026-07-01T00:00:00.000Z",
      "2026-07-04T00:00:00.000Z",
    ],
    ["今天", "2026-07-12T00:00:00.000Z", "2026-07-12T08:00:00.000Z"],
    ["昨天", "2026-07-11T00:00:00.000Z", "2026-07-12T00:00:00.000Z"],
    ["近7天", "2026-07-05T08:00:00.000Z", "2026-07-12T08:00:00.000Z"],
    ["本周", "2026-07-06T00:00:00.000Z", "2026-07-12T08:00:00.000Z"],
    ["上周", "2026-06-29T00:00:00.000Z", "2026-07-06T00:00:00.000Z"],
    ["上月", "2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"],
  ])(
    "normalizes %s into a bounded UTC interval",
    async (expression, from, to) => {
      const executeTool = vi.fn().mockResolvedValue([{ grossSales: 0 }]);
      const engine = createSemanticQueryEngine({
        catalogs: [catalog],
        allowedTools: ["summarize_sales"],
        executeTool,
        now: () => new Date("2026-07-12T08:00:00.000Z"),
      });

      await engine.query({
        question: `${expression} GMV`,
        proposal: {
          catalog: "sales",
          intent: "sales_summary",
          terms: ["gross_sales"],
          timeExpression: expression,
        },
      });

      expect(executeTool).toHaveBeenCalledWith(
        "summarize_sales",
        { from, to },
        { signal: undefined },
      );
    },
  );

  it("extracts a supported time expression from the original question", async () => {
    const executeTool = vi.fn().mockResolvedValue([{ grossSales: 4 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await engine.query({
      question: "本月 GMV 是多少？",
      proposal: {
        catalog: "sales",
        intent: "sales_summary",
        terms: ["gross_sales"],
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "summarize_sales",
      {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-12T08:00:00.000Z",
      },
      { signal: undefined },
    );
  });

  it("selects a unique visible catalog and contract from certified terms", async () => {
    const executeTool = vi.fn().mockResolvedValue([{ grossSales: 6 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    const result = await engine.query({
      question: "本月 GMV 是多少？",
      proposal: {
        terms: ["gross_sales"],
        timeExpression: "本月",
      },
    });

    expect(result).toMatchObject({
      type: "result",
      plan: {
        catalog: "sales",
        contract: "sales_summary",
        intent: "sales_summary",
      },
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it.each(["2026-01-01 到 2026-02-01", "2026-07-31 到 2026-07-01", "近32天"])(
    "rejects an invalid or over-31-day interval: %s",
    async (timeExpression) => {
      const executeTool = vi.fn();
      const engine = createSemanticQueryEngine({
        catalogs: [catalog],
        allowedTools: ["summarize_sales"],
        executeTool,
        now: () => new Date("2026-07-12T08:00:00.000Z"),
      });

      await expect(
        engine.query({
          question: `${timeExpression} GMV`,
          proposal: {
            catalog: "sales",
            intent: "sales_summary",
            terms: ["gross_sales"],
            timeExpression,
          },
        }),
      ).resolves.toMatchObject({
        type: "unsupported",
        code: "unsupported_time_window",
        queryId: expect.any(String),
      });
      expect(executeTool).not.toHaveBeenCalled();
    },
  );

  it("maps a certified static dimension value into a declared Tool parameter", async () => {
    const executeTool = vi.fn().mockResolvedValue([{ grossSales: 12 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [filteredCatalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await engine.query({
      question: "本月直播渠道 GMV 是多少？",
      proposal: {
        catalog: "filtered-sales",
        intent: "sales_summary",
        terms: ["gross_sales", "sales_channel"],
        timeExpression: "本月",
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "summarize_sales",
      {
        channel: "LIVE_STREAM",
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-12T08:00:00.000Z",
      },
      { signal: undefined },
    );
  });

  it("rejects a dimension filter that the certified contract cannot push down", async () => {
    const catalogWithoutFilterParameter = {
      ...filteredCatalog,
      name: "unfiltered-sales",
      queryContracts: [
        { ...filteredCatalog.queryContracts[0], parameters: [] },
      ],
    };
    const executeTool = vi.fn();
    const engine = createSemanticQueryEngine({
      catalogs: [catalogWithoutFilterParameter],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "本月直播渠道 GMV 是多少？",
        proposal: {
          catalog: "unfiltered-sales",
          intent: "sales_summary",
          terms: ["gross_sales", "sales_channel"],
          timeExpression: "本月",
        },
      }),
    ).resolves.toMatchObject({
      type: "unsupported",
      code: "filter_not_supported",
      queryId: expect.any(String),
    });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("rejects proposal fields that could select a Tool, SQL, or identity", async () => {
    const executeTool = vi.fn().mockResolvedValue([{ grossSales: 1 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "本月 GMV",
        proposal: {
          catalog: "sales",
          intent: "sales_summary",
          terms: ["gross_sales"],
          timeExpression: "本月",
          tool: "summarize_sales",
          sql: "select * from secrets",
          identity: "another-tenant",
        },
      } as never),
    ).rejects.toThrow();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("builds bounded pagination arguments and reports a truncated result", async () => {
    const executeTool = vi.fn().mockResolvedValue([
      { sku: "SKU-3", unitsSold: 8, totalCount: 5, ignored: true },
      { sku: "SKU-4", unitsSold: 7, totalCount: 5, ignored: true },
    ]);
    const engine = createSemanticQueryEngine({
      catalogs: [pagedCatalog],
      allowedTools: ["list_products"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    const result = await engine.query({
      question: "近7天商品销量第二页",
      proposal: {
        catalog: "products",
        intent: "top_products",
        terms: ["units_sold", "product"],
        timeExpression: "近7天",
        limit: 2,
        offset: 2,
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "list_products",
      {
        from: "2026-07-05T08:00:00.000Z",
        to: "2026-07-12T08:00:00.000Z",
        limit: 2,
        offset: 2,
      },
      { signal: undefined },
    );
    expect(result).toMatchObject({
      type: "result",
      rowCount: 2,
      truncated: true,
      data: [
        { sku: "SKU-3", unitsSold: 8, totalCount: 5 },
        { sku: "SKU-4", unitsSold: 7, totalCount: 5 },
      ],
    });
  });

  it("derives page size and offset deterministically from the original question", async () => {
    const executeTool = vi
      .fn()
      .mockResolvedValue([{ sku: "SKU-4", unitsSold: 7, totalCount: 8 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [pagedCatalog],
      allowedTools: ["list_products"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await engine.query({
      question: "近7天商品销量第二页，每页3条",
      proposal: {
        catalog: "products",
        intent: "top_products",
        terms: ["units_sold", "product"],
        timeExpression: "近7天",
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "list_products",
      expect.objectContaining({ limit: 3, offset: 3 }),
      { signal: undefined },
    );
  });

  it("derives a first-page limit from a 前N条 question", async () => {
    const executeTool = vi
      .fn()
      .mockResolvedValue([{ sku: "SKU-1", unitsSold: 9, totalCount: 8 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [pagedCatalog],
      allowedTools: ["list_products"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await engine.query({
      question: "近7天销量前5条",
      proposal: {
        catalog: "products",
        intent: "top_products",
        terms: ["units_sold", "product"],
        timeExpression: "近7天",
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "list_products",
      expect.objectContaining({ limit: 5, offset: 0 }),
      { signal: undefined },
    );
  });

  it("rejects an offset above the certified 10000-row bound", async () => {
    const executeTool = vi.fn();
    const engine = createSemanticQueryEngine({
      catalogs: [pagedCatalog],
      allowedTools: ["list_products"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "近7天商品销量",
        proposal: {
          catalog: "products",
          intent: "top_products",
          terms: ["units_sold", "product"],
          timeExpression: "近7天",
          limit: 20,
          offset: 10_001,
        },
      }),
    ).resolves.toMatchObject({
      type: "unsupported",
      code: "invalid_pagination",
    });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("accepts the certified offset boundary of 10000", async () => {
    const executeTool = vi
      .fn()
      .mockResolvedValue([{ sku: "SKU-X", unitsSold: 1, totalCount: 10_001 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [pagedCatalog],
      allowedTools: ["list_products"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    const result = await engine.query({
      question: "近7天商品销量",
      proposal: {
        catalog: "products",
        intent: "top_products",
        terms: ["units_sold", "product"],
        timeExpression: "近7天",
        limit: 1,
        offset: 10_000,
      },
    });

    expect(result.type).toBe("result");
    expect(executeTool).toHaveBeenCalledWith(
      "list_products",
      expect.objectContaining({ limit: 1, offset: 10_000 }),
      { signal: undefined },
    );
  });

  it("extracts a certified entity key without accepting it from the proposal", async () => {
    const executeTool = vi
      .fn()
      .mockResolvedValue([{ orderNumber: "EC20260601001", status: "PAID" }]);
    const engine = createSemanticQueryEngine({
      catalogs: [orderCatalog],
      allowedTools: ["get_order_detail"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    const result = await engine.query({
      question: "查询订单号 EC20260601001 的状态",
      proposal: {
        catalog: "orders",
        intent: "order_detail",
        terms: ["order_status"],
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "get_order_detail",
      { orderNumber: "EC20260601001" },
      { signal: undefined },
    );
    expect(result).toMatchObject({
      type: "result",
      data: [{ orderNumber: "EC20260601001", status: "PAID" }],
    });
  });

  it("applies a normalized contract parameter default", async () => {
    const defaultedCatalog = {
      ...orderCatalog,
      name: "defaulted-orders",
      queryContracts: [
        {
          ...orderCatalog.queryContracts[0],
          parameters: [
            { name: "orderNumber", required: true },
            { name: "locale", required: true, default: "zh-CN" },
          ],
        },
      ],
    };
    const executeTool = vi
      .fn()
      .mockResolvedValue([{ orderNumber: "EC20260601001", status: "PAID" }]);
    const engine = createSemanticQueryEngine({
      catalogs: [defaultedCatalog],
      allowedTools: ["get_order_detail"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await engine.query({
      question: "查询订单号 EC20260601001 的状态",
      proposal: {
        catalog: "defaulted-orders",
        intent: "order_detail",
        terms: ["order_status"],
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "get_order_detail",
      { locale: "zh-CN", orderNumber: "EC20260601001" },
      { signal: undefined },
    );
  });

  it("extracts a shipment number for a shipment entity contract", async () => {
    const shipmentCatalog = {
      ...orderCatalog,
      name: "shipments",
      dimensions: [
        { id: "shipment", labels: ["运单"], field: "Shipment.shipmentNumber" },
      ],
      queryContracts: [
        {
          id: "shipment_trace",
          tool: "get_shipment_trace",
          metrics: [],
          dimensions: ["shipment"],
          resultFields: ["shipmentNumber", "eventType"],
          limitations: ["只接受明确运单号。"],
          parameters: [{ name: "shipmentNumber", required: true }],
        },
      ],
      questionPatterns: [
        {
          id: "shipment_trace",
          examples: ["查询运单轨迹"],
          tool: "get_shipment_trace",
          contract: "shipment_trace",
          required: ["shipment_number"],
        },
      ],
    };
    const executeTool = vi
      .fn()
      .mockResolvedValue([
        { shipmentNumber: "SHP-20260601-0001", eventType: "SHIPPED" },
      ]);
    const engine = createSemanticQueryEngine({
      catalogs: [shipmentCatalog],
      allowedTools: ["get_shipment_trace"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await engine.query({
      question: "查询运单 SHP-20260601-0001 的轨迹",
      proposal: {
        catalog: "shipments",
        intent: "shipment_trace",
        terms: ["shipment"],
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "get_shipment_trace",
      { shipmentNumber: "SHP-20260601-0001" },
      { signal: undefined },
    );
  });

  it("rejects a catalog with non-UTC time semantics", () => {
    expect(() =>
      createSemanticQueryEngine({
        catalogs: [{ ...catalog, timeZone: "Asia/Shanghai" }],
        allowedTools: ["summarize_sales"],
        executeTool: vi.fn(),
        now: () => new Date("2026-07-12T08:00:00.000Z"),
      }),
    ).toThrow();
  });

  it("maps snake_case dimension ids to camelCase contract parameters", async () => {
    const customerSegmentCatalog = {
      ...filteredCatalog,
      name: "customer-sales",
      dimensions: [
        {
          id: "customer_segment",
          labels: ["客户分群"],
          field: "Customer.segment",
          values: [{ value: "VIP", labels: ["VIP", "高价值客户"] }],
        },
      ],
      queryContracts: [
        {
          ...filteredCatalog.queryContracts[0],
          dimensions: ["customer_segment"],
          parameters: [{ name: "customerSegment" }],
        },
      ],
    };
    const executeTool = vi.fn().mockResolvedValue([{ grossSales: 20 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [customerSegmentCatalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await engine.query({
      question: "本月 VIP 客户销售额",
      proposal: {
        catalog: "customer-sales",
        intent: "sales_summary",
        terms: ["gross_sales", "customer_segment"],
        timeExpression: "本月",
      },
    });

    expect(executeTool).toHaveBeenCalledWith(
      "summarize_sales",
      expect.objectContaining({ customerSegment: "VIP" }),
      { signal: undefined },
    );
  });

  it("does not let a broader ambiguity shadow a certified specific label", async () => {
    const inventoryCatalog = {
      kind: "business-semantic-catalog",
      name: "inventory",
      version: 1,
      databaseSchema: "fixture",
      metrics: [
        {
          id: "available_units",
          labels: ["可用库存"],
          resultField: "availableUnits",
          tools: ["summarize_inventory"],
        },
      ],
      dimensions: [
        {
          id: "inventory_risk_level",
          labels: ["库存风险等级"],
          field: "Inventory.riskLevel",
        },
      ],
      queryContracts: [
        {
          id: "inventory_health",
          tool: "summarize_inventory",
          metrics: ["available_units"],
          dimensions: ["inventory_risk_level"],
          resultFields: ["availableUnits"],
          limitations: ["快照不代表实时库存。"],
        },
      ],
      ambiguities: [
        { term: "库存", action: "clarify", reason: "请明确库存口径。" },
      ],
      questionPatterns: [
        {
          id: "inventory_health",
          examples: ["库存健康情况和风险分布"],
          tool: "summarize_inventory",
          contract: "inventory_health",
          required: ["time_window"],
        },
      ],
    };
    const executeTool = vi.fn().mockResolvedValue([{ availableUnits: 80 }]);
    const engine = createSemanticQueryEngine({
      catalogs: [inventoryCatalog],
      allowedTools: ["summarize_inventory"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    const result = await engine.query({
      question: "最近可用库存如何？",
      proposal: {
        catalog: "inventory",
        intent: "inventory_health",
        terms: ["available_units", "inventory_risk_level"],
        timeExpression: "近7天",
      },
    });

    expect(result.type).toBe("result");
    expect(executeTool).toHaveBeenCalledTimes(1);

    const generic = await engine.query({
      question: "最近库存怎么样？",
      proposal: {
        catalog: "inventory",
        intent: "inventory_health",
        terms: ["available_units", "inventory_risk_level"],
        timeExpression: "近7天",
      },
    });
    expect(generic).toMatchObject({
      type: "clarification",
      code: "ambiguous_term",
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["non-array result", { rows: [{ grossSales: 1 }] }],
    ["non-object row", [null]],
    ["missing certified result field", [{}]],
  ])("fails explicitly for a %s", async (_caseName, toolResult) => {
    const executeTool = vi.fn().mockResolvedValue(toolResult);
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "本月 GMV",
        proposal: {
          catalog: "sales",
          intent: "sales_summary",
          terms: ["gross_sales"],
          timeExpression: "本月",
        },
      }),
    ).rejects.toBeInstanceOf(SemanticQueryExecutionError);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("does not turn an executor exception into a successful response", async () => {
    const executeTool = vi.fn().mockRejectedValue(new Error("database down"));
    const engine = createSemanticQueryEngine({
      catalogs: [catalog],
      allowedTools: ["summarize_sales"],
      executeTool,
      now: () => new Date("2026-07-12T08:00:00.000Z"),
    });

    await expect(
      engine.query({
        question: "本月 GMV",
        proposal: {
          catalog: "sales",
          intent: "sales_summary",
          terms: ["gross_sales"],
          timeExpression: "本月",
        },
      }),
    ).rejects.toThrow("database down");
    expect(executeTool).toHaveBeenCalledTimes(1);
  });
});
