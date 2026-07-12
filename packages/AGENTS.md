# packages 协作指南

`packages/` 下放跨应用复用能力。每个 package 应该有清晰单一职责，并通过 package export 暴露稳定入口。

## 模块职责

- `ui`: React UI 组件和样式工具。
- `shared`: Zod schema、共享类型和常量。
- `db`: 平台 `public` schema、Prisma Client 和 Agent run repository。
- `ecommerce-fixture`: 独立 schema 的确定性跨域零售业务验证数据，不进入平台 runtime；物理名称为兼容边界。
- `logger`: Pino logger 统一配置。
- `semantic-query`: 自然语言候选到认证语义计划、Tool 执行和结果信封的共享深 module；不读取 env、不创建 MCP Client。
- `agent`: Agent runtime contract、selector 和公共入口。
- `agent-client`: Web、CLI 和其他 Node 调用方共用的 Agent HTTP/SSE Client。
- `agent-claude`: Claude Agent SDK backed runtime。
- `agent-eve`: Eve filesystem-first runtime 和 `agent/` authored surface。
- `toolbox-config`: Claude/Eve 共用的 Toolbox URL、Bearer token、Capability Pack/Profile 编译结果和业务语义 schema。

## 开发规则

- package 之间可以依赖，但要避免环形依赖。
- 共享类型优先从 `packages/shared` 导出。
- 应用专属运行逻辑不要放 package。
- package export 保持小而稳定，避免暴露内部文件路径。
- `apps/*` 只通过 `@agent-template/agent` 使用 Agent runtime，不直接依赖 `agent-claude` 或 `agent-eve`。

## 验证

```bash
pnpm --filter @agent-template/shared test
pnpm --filter @agent-template/ui typecheck
pnpm typecheck
```
