# packages/shared 协作指南

## 职责

`packages/shared` 提供跨 Web、API、Worker 共享的 Zod schema、TypeScript 类型和常量。

## 能力边界

- 健康检查响应 schema 放这里。
- BullMQ job name、queue name、Agent job payload schema 和 Agent job accepted metadata schema 放这里。
- Agent run input/result schema、Agent run event protocol 和 artifact schema 放这里。
- Agent Chat 的跨进程事件协议放这里；不加入 runtime 私有 MCP Client、连接配置或浏览器 MCP 代理类型。
- Redis URL 到 BullMQ connection options 的纯解析放这里。
- 导出的类型应由 schema 推导，避免 schema 和 type 分叉。

## 不应该做

- 不引入 React、Fastify、Prisma、BullMQ 运行实例或 Node-only 副作用。
- 不读取环境变量。
- 不放业务流程实现。
- 不新增 queue runtime module；等第三个 queue consumer 或可替换 adapter 需求出现再抽。

## 验证

```bash
pnpm --filter @agent-template/shared lint
pnpm --filter @agent-template/shared test
pnpm --filter @agent-template/shared typecheck
pnpm --filter @agent-template/shared build
```
