# apps/toolbox 协作指南

## 职责

`apps/toolbox` 是 MCP Toolbox for Databases 的本地配置目录，负责定义 Agent 可加载的数据库工具。

## 能力边界

- Toolbox server 是独立 Tool provider，不属于 Cloud 或 Eve Agent runtime。
- `tools.yaml` 只定义 source、tool 和 toolset，不放业务运行时代码。
- 业务 Skill 生成编排放在根目录 `scripts/`，本目录只提供被官方生成器读取的 Toolset 事实源。
- Toolbox 官方原始 Skill 完整保存在 `generated/toolbox-skills/`；runtime 适配版分别保存在 `.claude/skills/` 与 `packages/agent-eve/agent/skills/`。
- Toolset 只用于 Skill 生成与业务分组，不代表运行时授权；运行时权限以 MCP Host `allowedTools` 为准。
- `tools.yaml` 是 Tool、Toolset 和 annotations 的可执行事实源；`SEMANTIC_LAYER.md` 记录人类可读的业务指标与时间口径。
- 智能问数的术语、指标、维度取值、歧义规则和 golden cases 维护在 `semantic/`；每个领域独立建目录，不把业务专有名词写死进通用代码。
- 业务术语必须先映射到语义目录的 canonical id，再路由到认证 Tool；不允许提示词直接生成 SQL、表名、列名或模型可控的租户范围。
- 新增 Tool 遵循官方 `snake_case` 命名，新增 Toolset 使用 `kebab-case`；现有连字符 Tool 名是兼容契约，不添加重复别名。
- 只读 SQL Tool 必须显式声明 `readOnlyHint`、`destructiveHint`、`idempotentHint` 和 `openWorldHint`。
- 生产 Agent 默认只使用自定义 toolset，不使用 prebuilt generic tools。
- 数据库连接信息通过环境变量注入，不能把密码写死在 `tools.yaml`。

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
