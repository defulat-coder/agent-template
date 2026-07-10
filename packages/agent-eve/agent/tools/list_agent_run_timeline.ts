import { defineTool } from "eve/tools";
import { McpToolboxRunTimelineInputSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "List a bounded event timeline for one concrete Agent run from the Host-managed Toolbox MCP server.",
  inputSchema: McpToolboxRunTimelineInputSchema,
  async execute(input) {
    return callHostTool("list-agent-run-timeline", input);
  },
  toModelOutput: summarizeHostToolResult,
});
