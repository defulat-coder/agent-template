import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "Summarize template event counts by type in an explicit UTC time window through the Host-managed Toolbox MCP server.",
  inputSchema: McpToolboxTimeWindowSchema,
  async execute(input) {
    return callHostTool("summarize-template-events-by-type", input);
  },
  toModelOutput: summarizeHostToolResult,
});
