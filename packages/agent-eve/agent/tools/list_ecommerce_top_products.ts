import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowWithLimitSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "Rank synthetic ecommerce products by paid quantity and net merchandise sales in an explicit UTC time window.",
  inputSchema: McpToolboxTimeWindowWithLimitSchema,
  async execute(input) {
    return callHostTool("list-ecommerce-top-products", input);
  },
  toModelOutput: summarizeHostToolResult,
});
