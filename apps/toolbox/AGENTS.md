# apps/toolbox 协作指南

## 职责

`apps/toolbox` 是 MCP Toolbox for Databases 的本地配置目录，负责定义 Agent 可加载的数据库工具。

## 能力边界

- Toolbox server 是独立 Tool provider，不属于 Cloud 或 Eve Agent runtime。
- `tools.yaml` 只定义 source、tool 和 toolset，不放业务运行时代码。
- 业务 Skill 生成编排放在根目录 `scripts/`，本目录只提供被官方生成器读取的 Toolset 事实源。
- Toolbox 官方原始 Skill 完整保存在 `generated/toolbox-skills/`；runtime 适配版分别保存在 `.claude/skills/` 与 `packages/agent-eve/agent/skills/`。
- Toolset 只用于 Skill 生成与业务分组，不代表运行时授权；模型可见范围由 runtime capability profile 收窄，授权由 Toolbox OIDC、Tool scope 和数据库强制。
- `tools.yaml` 是 Tool、Toolset 和 annotations 的可执行事实源；`SEMANTIC_LAYER.md` 记录人类可读的业务指标与时间口径。
- 智能问数的术语、指标、维度取值、歧义规则和 golden cases 维护在 `semantic/`；每个领域独立建目录，不把业务专有名词写死进通用代码。
- 业务术语必须先映射到语义目录的 canonical id，再路由到认证 Tool；不允许提示词直接生成 SQL、表名、列名或模型可控的租户范围。
- 新增 Tool 遵循官方 `snake_case` 命名，新增 Toolset 使用 `kebab-case`；现有连字符 Tool 名是兼容契约，不添加重复别名。
- 只读 SQL Tool 必须显式声明 `readOnlyHint`、`destructiveHint`、`idempotentHint` 和 `openWorldHint`。
- 生产 Agent 默认只使用自定义 toolset，不使用 prebuilt generic tools。
- 数据库连接信息通过环境变量注入，不能把密码写死在 `tools.yaml`。
- 真实业务部署使用 `generated/toolbox-production/tools.yaml`，由 `pnpm toolbox:generate:production` 生成；它必须启用 Generic OIDC、server scope 和 Tool scope，不能手改生成产物。

## 智能问数后续设计标准

- [INTELLIGENT_QUERY.md](./INTELLIGENT_QUERY.md) 是智能问数的规范性分层标准；每个新增业务能力先选择“认证查询目录、semantic query compiler、独立语义层或 AlloyDB AI NL”之一，再开始改 `tools.yaml`。
- PostgreSQL 的默认路径是认证业务查询目录。只有业务域持续出现经验证的三维以上受控组合时，才能提议 semantic query compiler；必须先记录 ADR。不得在 PostgreSQL 上以 prompt 或自由 SQL 模拟 AlloyDB AI NL。
- 认证业务问数 Tool 的准入物是：语义目录的指标/维度/值映射/歧义规则、问题模式、golden cases、数据负责人、可信身份访问范围和数据新鲜度。缺失任一项时先补目录，不新增 Tool。
- 平台只读运维 Tool 不要求业务语义目录或业务 Skill，但仍必须有结果型描述、MCP annotations、有界参数、runtime capability profile 和 native 执行验证；不要把它误归为智能问数能力。
- Toolset 只用于 Skill 生成和模型上下文分组，不能当作运行时最小权限。实际授权以 Host `allowedTools`、可信身份注入和数据库 RLS/等效控制为准；需要 capability 隔离时，先设计 Host capability profile seam。
- Host 授权必须 fail-closed：每个 server 配置非空 `allowedTools`；`allowAllToolsForDevelopment` 只允许本地开发。生产 JWT 只从可信 invocation context 或 `TOOLBOX_AUTH_TOKEN` 注入，不能成为 Tool 参数。
- 分析 Tool 必须声明业务时区、`[from, to)` 时间边界与数据库时间类型；UTC 输入承诺不能依赖 PostgreSQL session 的隐式时区转换。
- 业务列表 Tool 必须使用稳定排序和有上限的 `limit/offset`，并返回 `totalCount`；Skill 必须规定分页与可操作空结果说明。
- 本地与生产 Toolbox 使用 JSON 日志和 SQLCommenter；生产通过 `TOOLBOX_OTLP_ENDPOINT` 接入 OpenTelemetry，禁止记录 token、密码或业务明细。
- 新增认证业务问数 Tool 必须同步 `tools.yaml`、Toolset、共享 Tool/Profile、Claude/Eve 原生 client、原始/实际 Skill、语义目录和 golden cases；完成语义门禁、Skill 生成校验与本地 native Tool 执行验收后才能合入。

## 不应该做

- 不在这里实现 API route、Worker process 或 Agent runtime selector。
- 不暴露任意 SQL 执行工具给生产 Agent。
- 不使用 templateParameters 替代普通参数，除非有白名单和明确 ADR。
- 不直接读取 `.env`；由 Docker Compose 或部署平台注入环境变量。

## 官方参考

- MCP protocol introduction: `https://modelcontextprotocol.io/docs/getting-started/intro`
- MCP Toolbox for Databases: `https://github.com/googleapis/mcp-toolbox`
- 官方文档: `https://mcp-toolbox.dev/`
- PostgreSQL source: `https://mcp-toolbox.dev/integrations/postgres/source/`
- Toolsets: `https://mcp-toolbox.dev/documentation/configuration/toolsets/`
- Style guide: `https://mcp-toolbox.dev/reference/style-guide/`
- Tool annotations: `https://mcp-toolbox.dev/documentation/configuration/tools/`

## 验证

```bash
pnpm toolbox:check
```

只有用户明确要求容器集成验证时，才运行 Docker 门禁。
