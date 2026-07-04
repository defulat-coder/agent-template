# packages/agent-eve 协作指南

## 职责

`packages/agent-eve` 是基于官方 `vercel/eve` npm 包的 Eve filesystem-first runtime，`agent/` 是该 runtime 的 authored surface。

## 能力边界

- `src/` 放运行时加载、状态和执行边界。
- `agent/agent.ts` 使用 `eve` 导出的 `defineAgent` 放 runtime config。
- `EVE_AGENT_MODEL` 由 `src/config.ts` 统一读取，runtime state 和 `agent/agent.ts` 必须同源。
- `EVE_AGENT_HOST` 是 Eve execution adapter 连接官方 Eve HTTP API 的运行配置；未配置时 execution 返回 skipped。
- `agent/instructions.md` 放基础 system prompt。
- `agent/tools`、`agent/skills`、`agent/channels`、`agent/connections`、`agent/hooks`、`agent/sandbox`、`agent/subagents` 按 Eve 语义增长。
- `eve` 依赖的 package spec 保持 `latest`，不要改成固定版本、`^x.y.z` 或 major range；该框架迭代快，按用户要求跟随 npm latest tag。
- 开发 Eve runtime、authored surface 或相关测试前，先使用 `.codex/skills/eve`。
- Eve 设计参考官方文档 `https://eve.dev/docs/introduction`；涉及 API 细节时必须读取当前安装版本的 `node_modules/eve/docs/README.md` 和相关文档。

## 不应该做

- 不实现 runtime selector；selector 留在 `@agent-template/agent`。
- 不让 `apps/*` 直接依赖这个包。
- 不把 Claude SDK 逻辑写进这里。
- 不凭记忆直接写 Eve API；以官方文档、本地 Eve skill 和安装包 docs 为准。

## 验证

```bash
pnpm --filter @agent-template/agent-eve lint
pnpm --filter @agent-template/agent-eve test
pnpm --filter @agent-template/agent-eve typecheck
pnpm --filter @agent-template/agent-eve build
```
