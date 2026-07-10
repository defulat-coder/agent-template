import { defineTool } from "eve/tools";
import { McpToolboxRunSummaryInputSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "Get the lifecycle summary for one concrete Agent run from the Host-managed Toolbox MCP server.",
  inputSchema: McpToolboxRunSummaryInputSchema,
  async execute(input) {
    return callHostTool("get-agent-run-summary", input);
  },
  toModelOutput: summarizeHostToolResult,
});
