import { defineTool } from "eve/tools";
import { McpToolboxTimeWindowWithLimitSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "Summarize MCP Toolbox invocation volume and latency in an explicit UTC time window.",
  inputSchema: McpToolboxTimeWindowWithLimitSchema,
  async execute(input) {
    return callHostTool("summarize-tool-invocations", input);
  },
  toModelOutput: summarizeHostToolResult,
});
