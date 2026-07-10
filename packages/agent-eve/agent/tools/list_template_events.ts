import { defineTool } from "eve/tools";
import { z } from "zod";
import { McpToolboxLimitSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "List template business events from the last 30 days through the Host-managed Toolbox MCP server.",
  inputSchema: z.object({
    limit: McpToolboxLimitSchema.optional(),
  }),
  async execute(input) {
    return callHostTool("list-template-events", input);
  },
  toModelOutput: summarizeHostToolResult,
});
