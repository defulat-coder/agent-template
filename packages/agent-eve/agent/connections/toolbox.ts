import { defineMcpClientConnection } from "eve/connections";
import { parseToolboxAgentConfig } from "@agent-template/toolbox-config";

const toolbox = parseToolboxAgentConfig({
  ...process.env,
  TOOLBOX_URL: process.env.TOOLBOX_URL ?? "http://localhost:15000",
});

if (!toolbox) {
  throw new Error("TOOLBOX_URL is required for the Eve Toolbox connection");
}

export default defineMcpClientConnection({
  description:
    "经过业务语义治理的 PostgreSQL 只读能力，支持 Agent 平台观测和合成电商销售、商品、订单与履约分析。",
  url: toolbox.url,
  tools: { allow: toolbox.allowedTools },
  ...(toolbox.authorizationToken
    ? {
        auth: {
          getToken: async () => ({ token: toolbox.authorizationToken! }),
        },
      }
    : {}),
});
