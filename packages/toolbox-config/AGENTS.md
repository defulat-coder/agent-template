# packages/toolbox-config 协作指南

## 职责

`packages/toolbox-config` 是 Claude 与 Eve 两个 Toolbox MCP Client adapter 共享的 capability module。它解析连接 URL、可信 Bearer token 和 Agent capability profile，并从 Capability Pack manifest 原子解析 Tool、Skill 与生产 scope。

## 能力边界

- 不创建 MCP Client，不管理 connection lifecycle，不代理 Tool call。
- Agent 调用方只选择 `AGENT_CAPABILITY_PROFILE`；Tool 名、Skill 名、Toolset、语义目录和 scope 是 Capability Pack implementation，不进入 Agent interface。
- `toolboxCapabilityPacks` 是 Tool、Skill、Toolset、语义目录和 scope 关系的事实源；`toolboxBusinessCapabilityPacks` 是 generator 与 checker 使用的扁平只读视图。
- profile 只组合完整 Capability Pack；不得在 profile 中手写 Tool 或 Skill 数组。`allowedTools`、`enabledSkills` 和 `scopes` 必须由同一次 activation 得出。
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
