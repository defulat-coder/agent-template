# packages/shared 协作指南

## 职责

`packages/shared` 提供跨 Web、API、Worker 共享的 Zod schema、TypeScript 类型和常量。

## 能力边界

- 健康检查响应 schema 放这里。
- BullMQ job name、queue name、payload schema 放这里。
- 导出的类型应由 schema 推导，避免 schema 和 type 分叉。

## 不应该做

- 不引入 React、Fastify、Prisma、BullMQ 运行实例或 Node-only 副作用。
- 不读取环境变量。
- 不放业务流程实现。

## 验证

```bash
pnpm --filter @project-template/shared lint
pnpm --filter @project-template/shared test
pnpm --filter @project-template/shared typecheck
pnpm --filter @project-template/shared build
```
