import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "Summarize daily gross sales, refunds, net sales, orders, and buyers for the synthetic ecommerce dataset.",
  inputSchema: McpToolboxTimeWindowSchema,
  async execute(input) {
    return callHostTool("summarize-ecommerce-sales-by-day", input);
  },
  toModelOutput: summarizeHostToolResult,
});
