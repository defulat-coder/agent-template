import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowWithLimitSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "List bounded synthetic ecommerce orders with operational and customer-segment context in an explicit UTC time window.",
  inputSchema: McpToolboxTimeWindowWithLimitSchema,
  async execute(input) {
    return callHostTool("list-ecommerce-orders-in-window", input);
  },
  toModelOutput: summarizeHostToolResult,
});
