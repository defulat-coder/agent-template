import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "在明确 UTC 时间窗内按大区汇总合成电商的销售额、退款、净销售额、买家数与客单价。",
  inputSchema: McpToolboxTimeWindowSchema,
  async execute(input) {
    return callHostTool("summarize_sales_by_region", input);
  },
  toModelOutput: summarizeHostToolResult,
});
