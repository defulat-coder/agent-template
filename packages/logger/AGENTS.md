# packages/logger 协作指南

## 职责

`packages/logger` 提供统一 Pino logger 配置，让 API 和 Worker 共享日志格式与默认 level。

## 能力边界

- `createLoggerOptions` 给 Fastify 等框架使用。
- `createLogger` 给普通 Node 进程使用。
- 默认 level 从 `LOG_LEVEL` 读取，未配置时使用 `info`。

## 不应该做

- 不在这里写请求上下文、业务字段或具体 transport。
- 不依赖 Fastify、BullMQ 或应用模块。
- 不吞掉错误；这里只负责创建 logger。

## 验证

```bash
pnpm --filter @project-template/logger lint
pnpm --filter @project-template/logger test
pnpm --filter @project-template/logger typecheck
pnpm --filter @project-template/logger build
```
