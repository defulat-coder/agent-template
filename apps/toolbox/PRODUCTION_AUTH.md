# Toolbox 生产认证

真实业务数据使用生成的 [生产配置](../../generated/toolbox-production/tools.yaml)，本地合成 fixture 继续使用 [开发配置](./tools.yaml)。生产配置由 `scripts/generate-toolbox-production-config.ts` 从开发事实源生成，为 MCP server 增加 Generic OIDC，并为业务问数与平台观测 Tool 分配不同 scope；不要手工维护第二份 SQL。

## 认证链路

```text
可信调用方
  -> MCP Host（只从可信 invocation context 或 TOOLBOX_AUTH_TOKEN 读取 JWT）
  -> Authorization: Bearer <JWT>
  -> Toolbox Generic OIDC（issuer、audience、server scope）
  -> Tool scope（ecommerce:read / agent-template:observe）
  -> 受限 PostgreSQL 角色与 RLS/等效控制
```

Token、租户和组织范围都不是模型参数。MCP Host 的 `callTool` / `listTools` 可接收可信 `authorizationToken` context，部署也可通过 `mcp-host.config.json` 的 `authTokenEnv` 从 `TOOLBOX_AUTH_TOKEN` 读取服务身份；两者都不会出现在 `getServers()`、Tool schema 或 Tool 结果中。

## 生成与校验

```bash
pnpm toolbox:generate:production
pnpm toolbox:check:production
```

生成配置要求 JWT 至少有 `mcp:tools`，调用电商 Tool 还需要 `ecommerce:read`，调用平台观测 Tool 需要 `agent-template:observe`。

## 本地启动生产认证配置

下面只启动本地 Toolbox binary，不启动 Docker；PostgreSQL 地址仍由 `TOOLBOX_POSTGRES_*` 提供。

项目提供可直接运行的本地端到端认证验收。它会在随机本机端口启动临时 OIDC issuer 和官方 Toolbox binary，生成短期 RS256 JWT，验证未认证 MCP 被拒绝、scope 后的 18 个 Tool 可发现，并通过 MCP Host 实际执行一个电商查询；不会写入私钥或 token，也不会启动 Docker：

```bash
pnpm toolbox:verify:auth:local
```

```bash
TOOLBOX_OIDC_ISSUER='https://issuer.example.com' \
TOOLBOX_OIDC_AUDIENCE='agent-template-toolbox' \
TOOLBOX_URL='http://127.0.0.1:15000' \
node_modules/.bin/toolbox \
  --config generated/toolbox-production/tools.yaml \
  --toolbox-url http://127.0.0.1:15000 \
  --address 127.0.0.1 \
  --port 15000 \
  --logging-format JSON \
  --sql-commenter \
  --telemetry-service-name agent-template-toolbox
```

调用方通过 `TOOLBOX_AUTH_TOKEN` 或可信 invocation context 提供由该 issuer 签发、audience 与 scope 均匹配的 JWT。生产部署不得使用占位 token，也不得把终端用户提交的任意字符串直接当成可信 token。

## 多租户数据

当前电商 fixture 没有租户列，因此生产配置只实施 server 和 Tool scope，不伪造不存在的行级隔离。接入真实多租户表时，必须同时完成以下事项：

- 把稳定的 `tenantId` / `organizationId` 建成一等数据库列，并建立 RLS 或等效策略。
- 在 Tool 参数中使用 Toolbox `authServices` 从已验证 JWT claim 自动注入租户范围；该参数不能出现在模型输入 schema 中。
- SQL 的租户谓词与数据库策略使用同一个 claim 语义，并增加跨租户拒绝测试。
- 语义目录记录访问范围和数据负责人，golden evaluation 覆盖越权问题。

## 官方参考

- [Toolbox Authentication](https://mcp-toolbox.dev/documentation/configuration/authentication/)
- [Toolbox MCP Authorization](https://mcp-toolbox.dev/documentation/configuration/toolbox_mcp_auth/)
- [Authenticated parameters 与 Tool scopes](https://mcp-toolbox.dev/documentation/configuration/tools/)
