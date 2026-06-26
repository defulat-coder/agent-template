# packages/agent 协作指南

## 职责

`packages/agent` 是 Claude Agent SDK 的边界层，负责解析 Agent 配置、暴露配置状态，并集中加载 SDK。

## 能力边界

- `parseAgentConfig` 只读取 Agent 相关环境变量。
- `getAgentConfigState` 返回是否已配置 API key 和当前模型。
- `loadClaudeAgentSdk` 保持懒加载，避免无 key 时影响本地启动。

## 不应该做

- 不在这里处理 HTTP 请求。
- 不在这里处理 BullMQ job 生命周期。
- 不把具体业务 prompt 或产品逻辑写进通用 agent package。
- 不要求本地开发必须配置 `ANTHROPIC_API_KEY`。

## 验证

```bash
pnpm --filter @project-template/agent lint
pnpm --filter @project-template/agent test
pnpm --filter @project-template/agent typecheck
pnpm --filter @project-template/agent build
```
