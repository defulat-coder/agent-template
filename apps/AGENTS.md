# apps 协作指南

`apps/` 下只放可运行进程。应用可以编排多个 package，但不要把共享逻辑写死在应用目录里。

## 模块职责

- `web`: Next.js 前端应用。
- `api`: Fastify HTTP API。
- `worker`: BullMQ 后台任务进程。

## 开发规则

- 应用层负责运行时装配、路由、进程入口和环境变量解析。
- 可复用 schema、组件、logger、agent、db 能力必须优先放到 `packages/`。
- 应用之间不要直接互相 import；跨应用共享内容放入 package。
- 新增用户可见文案默认中文。

## 验证

```bash
pnpm --filter @project-template/web lint
pnpm --filter @project-template/api test
pnpm --filter @project-template/worker typecheck
```

跨应用改动后运行：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```
