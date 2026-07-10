import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import {
  McpToolboxLimitSchema,
  McpToolboxOrderNumberInputSchema,
  McpToolboxRunSummaryInputSchema,
  McpToolboxRunTimelineInputSchema,
  McpToolboxTimeWindowSchema,
  McpToolboxTimeWindowWithLimitSchema,
} from "@agent-template/shared";
import {
  loadMcpHostConfig,
  readAgentCapabilityTools,
} from "@agent-template/mcp-host";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineDynamic({
  events: {
    "session.started": async () => {
      const visibleTools = new Set(
        readAgentCapabilityTools(loadMcpHostConfig(process.env)),
      );
      const tools = {
        "list-agent-runs": defineTool({
          description:
            "List Agent runs from the last 30 days through the Host-managed Toolbox MCP server.",
          inputSchema: z.object({ limit: McpToolboxLimitSchema.optional() }),
          async execute(input) {
            return callHostTool("list-agent-runs", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "get-agent-run-summary": defineTool({
          description:
            "Get the lifecycle summary for one concrete Agent run from the Host-managed Toolbox MCP server.",
          inputSchema: McpToolboxRunSummaryInputSchema,
          async execute(input) {
            return callHostTool("get-agent-run-summary", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "list-agent-run-timeline": defineTool({
          description:
            "List a bounded event timeline for one concrete Agent run from the Host-managed Toolbox MCP server.",
          inputSchema: McpToolboxRunTimelineInputSchema,
          async execute(input) {
            return callHostTool("list-agent-run-timeline", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "list-template-events": defineTool({
          description:
            "List template business events from the last 30 days through the Host-managed Toolbox MCP server.",
          inputSchema: z.object({ limit: McpToolboxLimitSchema.optional() }),
          async execute(input) {
            return callHostTool("list-template-events", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "summarize-ecommerce-sales-by-day": defineTool({
          description:
            "Summarize daily gross sales, refunds, net sales, orders, and buyers for the synthetic ecommerce dataset.",
          inputSchema: McpToolboxTimeWindowSchema,
          async execute(input) {
            return callHostTool("summarize-ecommerce-sales-by-day", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "summarize-ecommerce-sales-by-channel": defineTool({
          description:
            "Compare synthetic ecommerce sales performance by channel in an explicit UTC time window.",
          inputSchema: McpToolboxTimeWindowSchema,
          async execute(input) {
            return callHostTool("summarize-ecommerce-sales-by-channel", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        summarize_sales_by_region: defineTool({
          description:
            "在明确 UTC 时间窗内按大区汇总合成电商的销售额、退款、净销售额、买家数与客单价。",
          inputSchema: McpToolboxTimeWindowSchema,
          async execute(input) {
            return callHostTool("summarize_sales_by_region", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        summarize_sales_by_customer_segment: defineTool({
          description:
            "在明确 UTC 时间窗内按合成客户分群汇总电商销售额、退款、净销售额、买家数与客单价。",
          inputSchema: McpToolboxTimeWindowSchema,
          async execute(input) {
            return callHostTool("summarize_sales_by_customer_segment", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "list-ecommerce-top-products": defineTool({
          description:
            "Rank synthetic ecommerce products by paid quantity and net merchandise sales in an explicit UTC time window.",
          inputSchema: McpToolboxTimeWindowWithLimitSchema,
          async execute(input) {
            return callHostTool("list-ecommerce-top-products", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        summarize_merchandise_by_category: defineTool({
          description:
            "在明确 UTC 时间窗内按商品品类汇总合成电商的销量、商品销售额与退款后商品销售额。",
          inputSchema: McpToolboxTimeWindowSchema,
          async execute(input) {
            return callHostTool("summarize_merchandise_by_category", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "list-ecommerce-orders-in-window": defineTool({
          description:
            "List bounded synthetic ecommerce orders with operational and customer-segment context in an explicit UTC time window.",
          inputSchema: McpToolboxTimeWindowWithLimitSchema,
          async execute(input) {
            return callHostTool("list-ecommerce-orders-in-window", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "get-ecommerce-order-detail": defineTool({
          description:
            "Get one synthetic ecommerce order and its line items from a concrete order number.",
          inputSchema: McpToolboxOrderNumberInputSchema,
          async execute(input) {
            return callHostTool("get-ecommerce-order-detail", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "list-ecommerce-fulfillment-exceptions": defineTool({
          description:
            "List bounded paid but unfulfilled synthetic ecommerce orders in an explicit UTC time window.",
          inputSchema: McpToolboxTimeWindowWithLimitSchema,
          async execute(input) {
            return callHostTool("list-ecommerce-fulfillment-exceptions", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "list-template-events-in-window": defineTool({
          description:
            "List bounded template events in an explicit UTC time window through the Host-managed Toolbox MCP server.",
          inputSchema: McpToolboxTimeWindowWithLimitSchema,
          async execute(input) {
            return callHostTool("list-template-events-in-window", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "summarize-template-events-by-type": defineTool({
          description:
            "Summarize template event counts by type in an explicit UTC time window through the Host-managed Toolbox MCP server.",
          inputSchema: McpToolboxTimeWindowSchema,
          async execute(input) {
            return callHostTool("summarize-template-events-by-type", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "list-failed-agent-runs-in-window": defineTool({
          description:
            "List bounded Agent failures in an explicit UTC time window through the Host-managed Toolbox MCP server.",
          inputSchema: McpToolboxTimeWindowWithLimitSchema,
          async execute(input) {
            return callHostTool("list-failed-agent-runs-in-window", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "summarize-tool-invocations": defineTool({
          description:
            "Summarize MCP Toolbox invocation volume and latency in an explicit UTC time window.",
          inputSchema: McpToolboxTimeWindowWithLimitSchema,
          async execute(input) {
            return callHostTool("summarize-tool-invocations", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
        "get-template-event": defineTool({
          description:
            "Get one template business event from the Host-managed Toolbox MCP server.",
          inputSchema: z.object({ eventId: z.string().min(1) }),
          async execute(input) {
            return callHostTool("get-template-event", input);
          },
          toModelOutput: summarizeHostToolResult,
        }),
      };

      return Object.fromEntries(
        Object.entries(tools)
          .filter(([toolName]) => visibleTools.has(toolName))
          .map(([toolName, tool]) => [toolName.replaceAll("-", "_"), tool]),
      );
    },
  },
});
