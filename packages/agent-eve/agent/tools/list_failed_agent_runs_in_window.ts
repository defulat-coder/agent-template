import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowWithLimitSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "List bounded Agent failures in an explicit UTC time window through the Host-managed Toolbox MCP server.",
  inputSchema: McpToolboxTimeWindowWithLimitSchema,
  async execute(input) {
    return callHostTool("list-failed-agent-runs-in-window", input);
  },
  toModelOutput: summarizeHostToolResult,
});
