# apps/web 协作指南

## 职责

`apps/web` 是 Next.js 前端应用，负责用户界面、页面组合、浏览器端交互和调用 API 的展示逻辑。

## 能力边界

- 使用 App Router，页面入口在 `app/`。
- 共享 UI 组件从 `@project-template/ui` 引入。
- 共享类型和响应 schema 从 `@project-template/shared` 引入。
- API base URL 使用 `NEXT_PUBLIC_API_BASE_URL`，默认 `http://localhost:4000`。

## 不应该做

- 不在这里实现通用 Button、cn、schema 或服务端队列逻辑。
- 不直接连接 PostgreSQL、Redis 或 BullMQ。
- 不把业务常量散落在页面里；可复用内容放到 `src/lib/` 或共享 package。

## UI 规则

- 用户可见文案默认中文。
- shadcn/ui 相关改动优先参考 `.codex/skills/shadcn`。
- React/Next.js 性能相关改动优先参考 `.codex/skills/react-best-practices`。
- 复杂视觉和体验优化优先参考 `.codex/skills/impeccable`。

## 验证

```bash
pnpm --filter @project-template/web lint
pnpm --filter @project-template/web test
pnpm --filter @project-template/web typecheck
pnpm --filter @project-template/web build
```
