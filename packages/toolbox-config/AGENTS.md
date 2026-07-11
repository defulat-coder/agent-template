# packages/toolbox-config 协作指南

## 职责

`packages/toolbox-config` 是 Claude 与 Eve 两个 Toolbox MCP Client adapter 共享的配置 module。它只解析连接 URL、可信 Bearer token、Agent capability profile 和业务语义目录 schema。

## 能力边界

- 不创建 MCP Client，不管理 connection lifecycle，不代理 Tool call。
- `TOOLBOX_AUTH_TOKEN` 只作为 runtime connection credential，不进入模型参数、Tool schema 或对话历史。
- capability profile 只限制模型可见工具；Toolbox OIDC/scope 与 PostgreSQL 权限负责真实授权。
- 新增 Toolbox Tool 时同步更新 `toolboxToolNames`、相关 profile、`tools.yaml`、Skills 和语义目录。

## 验证

```bash
pnpm --filter @agent-template/toolbox-config lint
pnpm --filter @agent-template/toolbox-config typecheck
pnpm --filter @agent-template/toolbox-config test
pnpm --filter @agent-template/toolbox-config build
```
