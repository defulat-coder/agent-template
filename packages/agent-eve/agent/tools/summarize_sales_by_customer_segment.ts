import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "在明确 UTC 时间窗内按合成客户分群汇总电商销售额、退款、净销售额、买家数与客单价。",
  inputSchema: McpToolboxTimeWindowSchema,
  async execute(input) {
    return callHostTool("summarize_sales_by_customer_segment", input);
  },
  toModelOutput: summarizeHostToolResult,
});
