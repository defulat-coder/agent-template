# Toolbox 生产认证

真实业务数据使用生成的 [生产配置](../../generated/toolbox-production/tools.yaml)，本地合成 fixture 继续使用 [开发配置](./tools.yaml)。生产配置由 `scripts/generate-toolbox-production-config.ts` 从开发事实源生成，为 MCP server 增加 Generic OIDC，并为业务问数与平台观测 Tool 分配不同 scope；不要手工维护第二份 SQL。

## 认证链路

```text
Claude / Eve Agent runtime
  -> runtime-owned MCP Client（只从部署环境 TOOLBOX_AUTH_TOKEN 读取 JWT）
  -> Authorization: Bearer <JWT>
  -> Toolbox Generic OIDC（issuer、audience、server scope）
  -> Tool scope（observe / ecommerce / finance / logistics / supply-chain / marketing）
  -> 受限 PostgreSQL 角色与 RLS/等效控制
```

Token、租户和组织范围都不是模型参数。Claude 仅把 `TOOLBOX_AUTH_TOKEN` 写入 SDK MCP server 的 `Authorization` header，Eve connection 仅通过 `auth.getToken` 返回 token；二者都不把 token 放进模型 Tool schema、Tool 参数、Tool 结果或 Claude subprocess env。

## 生成与校验

```bash
pnpm toolbox:generate:production
pnpm toolbox:check:production
```

生成配置要求 JWT 至少有 `mcp:tools`；每个 Capability Pack 还需要自己的最小 Tool scope：`ecommerce:read`、`finance:read`、`logistics:read`、`supply-chain:read`、`marketing:read`，平台观测使用 `agent-template:observe`。
Tool 与 scope 的穷尽映射由 `@agent-template/toolbox-config` 的 Capability Pack 派生；生成器遇到未分类 Tool 时直接失败，不从 Toolset 名称推断授权。`pnpm toolbox:verify:auth:local` 会为每个 scope 生成独立最小 JWT，验证正向调用和跨 scope 拒绝。

## 本地启动生产认证配置

下面只启动本地 Toolbox binary，不启动 Docker；PostgreSQL 地址仍由 `TOOLBOX_POSTGRES_*` 提供。

项目提供可直接运行的本地端到端认证验收。它会在随机本机端口启动临时 OIDC issuer 和官方 Toolbox binary，生成短期 RS256 JWT，验证未认证 MCP 被拒绝、全部 Tool 完成 scope 分类，并通过原生 MCP Client 实际执行各业务 Pack 的代表查询及跨 scope 拒绝；不会写入私钥或 token，也不会启动 Docker：

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

Agent runtime 通过部署环境的 `TOOLBOX_AUTH_TOKEN` 提供由该 issuer 签发、audience 与 scope 均匹配的 JWT。生产部署不得使用占位 token，也不得把终端用户提交的任意字符串直接当成可信 token。
认证连接必须同时显式设置岗位级 `AGENT_CAPABILITY_PROFILE`；共享配置会拒绝缺失 profile，以及使用聚合开发 Profile `development-all` 或 `business-operations` 的 Bearer token 连接。
只读数据库角色必须显式获得所需 schema 的 `USAGE`，并只对认证 Tool 使用的表/列授予 `SELECT`；当前合成配置需要 `public` 与 `ecommerce_fixture`，不能依靠默认 `search_path` 扩大权限。

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
