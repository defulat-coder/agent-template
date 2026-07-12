# packages/toolbox-config 协作指南

## 职责

`packages/toolbox-config` 是 Claude 与 Eve 两个 Toolbox MCP Client adapter 共享的 capability module。它解析连接 URL、可信 Bearer token 和 Agent capability profile，并从 Capability Pack manifest 原子解析可执行 Tool、模型直连 Tool、Skill、语义目录与生产 scope。

## 能力边界

- 不创建 MCP Client，不管理 connection lifecycle，不代理 Tool call。
- Agent 调用方只选择 `AGENT_CAPABILITY_PROFILE`；Tool 名、Skill 名、Toolset、语义目录和 scope 是 Capability Pack implementation，不进入 Agent interface。
- `semanticExecutionTools` 是 runtime-local 语义执行器可调用的认证业务面；`modelSurface.visibleTools/hiddenTools` 是模型 Tool context 的显式策略。兼容字段 `tools`/`allowedTools` 与 `modelVisibleTools` 不得成为新调用方的事实源。业务 Tool 必须经 `query_business_data` 解析后执行。
- `semanticCatalogs` 由业务 Pack 原子派生；`business-semantic-catalogs.generated.ts` 是从 `apps/toolbox/semantic` 与 `tools.yaml` 生成的 runtime artifact，不手工维护。
- `toolboxCapabilityPacks` 是 Tool、Skill、Toolset、语义目录和 scope 关系的事实源；`toolboxBusinessCapabilityPacks` 是 generator 与 checker 使用的扁平只读视图。
- profile 只组合完整 Capability Pack；不得在 profile 中手写 Tool 或 Skill 数组。`semanticExecutionTools`、`modelSurface`、`enabledSkills`、`semanticCatalogs` 和 `scopes` 必须由同一次 activation 得出。
- `TOOLBOX_AUTH_TOKEN` 只作为 runtime connection credential，不进入模型参数、Tool schema 或对话历史。
- 配置 `TOOLBOX_AUTH_TOKEN` 时必须显式选择岗位级 capability profile；聚合的 `development-all` 与 `business-operations` 只用于本地开发/演示，认证连接不允许 fail-open。
- capability profile 只限制模型可见工具；Toolbox OIDC/scope 与 PostgreSQL 权限负责真实授权。
- `toolboxToolNames`、`toolboxToolScopes` 和兼容的 `toolboxCapabilityProfiles` 都从 Pack manifest 派生，不单独维护。
- 新增业务能力时定义一个任务级 Pack，并同步 `tools.yaml` Toolset 与对应语义目录；Skill 必须由官方 Toolbox generator 生成。

## 验证

```bash
pnpm --filter @agent-template/toolbox-config lint
pnpm --filter @agent-template/toolbox-config typecheck
pnpm --filter @agent-template/toolbox-config test
pnpm --filter @agent-template/toolbox-config build
```
