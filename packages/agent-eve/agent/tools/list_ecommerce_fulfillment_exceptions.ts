import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowWithLimitSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "List bounded paid but unfulfilled synthetic ecommerce orders in an explicit UTC time window.",
  inputSchema: McpToolboxTimeWindowWithLimitSchema,
  async execute(input) {
    return callHostTool("list-ecommerce-fulfillment-exceptions", input);
  },
  toModelOutput: summarizeHostToolResult,
});
