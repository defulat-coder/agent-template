# apps 协作指南

`apps/` 下只放可运行进程。应用可以编排多个 package，但不要把共享逻辑写死在应用目录里。

## 模块职责

- `web`: Next.js 前端应用。
- `web-qa`: Codex Browser 测试计划与确定性 HTTP/SSE fixture。
- `api`: Fastify HTTP API。
- `worker`: BullMQ 后台任务进程。
- `toolbox`: MCP Toolbox for Databases 配置目录，提供 Agent 可加载的数据库工具。
- `cli`: 基于 Incur 的可安装 Agent 平台命令行客户端。

## 开发规则

- 应用层负责运行时装配、路由、进程入口和环境变量解析。
- 可复用 schema、组件、logger、agent、db 能力必须优先放到 `packages/`。
- 应用之间不要直接互相 import；跨应用共享内容放入 package。
- Tool provider 放在独立应用边界；不要把 `apps/toolbox/tools.yaml` import 到 API、Worker 或 runtime package。
- 应用内 seam 优先放在对应应用目录；只有两个以上真实 adapter 或第三个调用方出现时再上移到 `packages/`。
- 新增用户可见文案默认中文。

## 验证

```bash
pnpm --filter @agent-template/web lint
pnpm --filter @agent-template/api test
pnpm --filter @agent-template/worker typecheck
```

跨应用改动后运行：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```
