import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "在明确 UTC 时间窗内按商品品类汇总合成电商的销量、商品销售额与退款后商品销售额。",
  inputSchema: McpToolboxTimeWindowSchema,
  async execute(input) {
    return callHostTool("summarize_merchandise_by_category", input);
  },
  toModelOutput: summarizeHostToolResult,
});
