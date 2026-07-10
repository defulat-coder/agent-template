import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "Compare synthetic ecommerce sales performance by channel in an explicit UTC time window.",
  inputSchema: McpToolboxTimeWindowSchema,
  async execute(input) {
    return callHostTool("summarize-ecommerce-sales-by-channel", input);
  },
  toModelOutput: summarizeHostToolResult,
});
