# packages/agent-claude 协作指南

## 职责

`packages/agent-claude` 是 Claude Agent SDK backed runtime，负责 Claude 配置解析和 SDK 懒加载。

## 能力边界

- `parseClaudeAgentConfig` 只读取 Claude runtime 相关环境变量。
- `getClaudeAgentRuntimeStateFromEnv` 返回 API key 配置状态和模型。
- `loadClaudeAgentSdk` 保持懒加载，避免无 key 时影响本地启动。
- Claude runtime 设计参考官方文档 `https://code.claude.com/docs/en/agent-sdk/overview`。

## 不应该做

- 不处理 HTTP 请求或 BullMQ job 生命周期。
- 不实现 runtime selector；selector 留在 `@agent-template/agent`。
- 不写具体业务 prompt。
- 不凭记忆直接写 Claude Agent SDK API；以官方文档和已安装包类型为准。

## 验证

```bash
pnpm --filter @agent-template/agent-claude lint
pnpm --filter @agent-template/agent-claude test
pnpm --filter @agent-template/agent-claude typecheck
pnpm --filter @agent-template/agent-claude build
```
