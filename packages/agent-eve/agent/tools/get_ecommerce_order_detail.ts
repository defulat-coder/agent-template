import { defineTool } from "eve/tools";
import { McpToolboxOrderNumberInputSchema } from "@agent-template/shared";
import { callHostTool, summarizeHostToolResult } from "../lib/mcp_host";

export default defineTool({
  description:
    "Get one synthetic ecommerce order and its line items from a concrete order number.",
  inputSchema: McpToolboxOrderNumberInputSchema,
  async execute(input) {
    return callHostTool("get-ecommerce-order-detail", input);
  },
  toModelOutput: summarizeHostToolResult,
});
