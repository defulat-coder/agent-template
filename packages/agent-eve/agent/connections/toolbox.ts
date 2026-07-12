import { defineMcpClientConnection } from "eve/connections";
import { readEveToolboxConfig } from "../lib/capability-profile";

const toolbox = readEveToolboxConfig(process.env);

if (!toolbox) {
  throw new Error("TOOLBOX_URL is required for the Eve Toolbox connection");
}

export default defineMcpClientConnection({
  description:
    "允许模型直接使用的 PostgreSQL 只读平台观测能力；业务问数统一通过 query_business_data。",
  url: toolbox.url,
  tools: { allow: toolbox.modelSurface.visibleTools },
  ...(toolbox.authorizationToken
    ? {
        auth: {
          getToken: async () => ({ token: toolbox.authorizationToken! }),
        },
      }
    : {}),
});
