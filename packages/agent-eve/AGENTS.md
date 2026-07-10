# packages/agent-eve 协作指南

## 职责

`packages/agent-eve` 是基于官方 `vercel/eve` npm 包的 Eve filesystem-first runtime，`agent/` 是该 runtime 的 authored surface。

## 能力边界

- `src/` 放运行时加载、状态和执行边界。
- `agent/agent.ts` 使用 `eve` 导出的 `defineAgent` 放 runtime config。
- `EVE_AGENT_MODEL` 由 `src/config.ts` 统一读取，runtime state 和 `agent/agent.ts` 必须同源。
- `EVE_AGENT_HOST` 是 Eve execution adapter 连接官方 Eve HTTP API 的运行配置；未配置时 execution 返回 skipped。
- `EVE_AGENT_SERVICE_TOKEN` 是 API/Worker 到 Eve HTTP channel 的可选服务凭证；配置后 client 发送 `x-agent-template-eve-token`，Eve channel 校验该 header。
- Docker Compose 提供 `eve-agent` 服务，默认监听 `13010`，API/Worker 通过 `EVE_AGENT_HOST` 连接它。
- Kimi Code 通过 `@ai-sdk/anthropic` 的 Anthropic-compatible provider 接入 Eve authored surface。
- Eve 默认使用 `ANTHROPIC_BASE_URL=https://api.kimi.com/coding/`、`ANTHROPIC_MODEL=kimi-for-coding`、`ANTHROPIC_API_KEY`。
- Kimi 模型不是 Eve/AI Gateway catalog 内置模型，`agent/agent.ts` 必须显式设置 `modelContextWindowTokens` 和 `compaction.modelContextWindowTokens`，避免 Eve 编译期查不到 context window metadata。
- `agent/instructions.md` 放基础 system prompt。
- `agent/channels/eve.ts` 放 Eve HTTP route auth；不要删除 API service auth，否则 `@agent-template/agent-eve` client 会被 Eve session route 拒绝。
- `agent/tools/web_search.ts` 禁用 Eve provider-managed `web_search`；Kimi Anthropic-compatible stream 会返回缺少 `id` 的 server tool block，启用后会触发 Eve/AI SDK 类型校验失败。
- `agent/tools`、`agent/skills`、`agent/channels`、`agent/hooks`、`agent/sandbox`、`agent/subagents` 按 Eve 语义增长。
- 电商业务 Skill 以 Toolbox 官方 `skills-generate` 产物为来源，通过 `pnpm --filter @agent-template/agent-eve skills:generate:toolbox` 同步到 Eve 与 Claude authored surface。
- 运行时 Skill 只安装适配后的 `SKILL.md`，并调用已有 Host-managed typed tools；不要把官方生成的直连脚本复制进 Agent skill 目录。
- Toolbox 能力通过 Eve authored tools 接入，工具实现委托 `@agent-template/mcp-host`；不要在 `agent/connections` 下恢复 runtime-owned Toolbox MCP connection。
- Eve stream 事件需要转换成 shared `AgentRunEvent`，至少覆盖 `message.completed`、`actions.requested`、`action.result` 和失败事件，保证 API Chat SSE 与前端 timeline 可用。
- `eve` 依赖的 package spec 保持 `latest`，不要改成固定版本、`^x.y.z` 或 major range；该框架迭代快，按用户要求跟随 npm latest tag。
- 开发 Eve runtime、authored surface 或相关测试前，先使用 `.codex/skills/eve`。
- 涉及 API 细节时必须读取当前安装版本的 `node_modules/eve/docs/README.md` 和相关文档。

## 不应该做

- 不实现 runtime selector；selector 留在 `@agent-template/agent`。
- 不让 `apps/*` 直接依赖这个包。
- 不把 Claude SDK 逻辑写进这里。
- 不把 Kimi API Key 写入仓库。
- 不把 PostgreSQL 连接信息或 Toolbox `tools.yaml` 复制进 Eve runtime package；数据库权限留在 `apps/toolbox`。
- 不让 Eve authored surface 直接维护 MCP client lifecycle；MCP 协议连接统一属于 `@agent-template/mcp-host`。
- 不凭记忆直接写 Eve API；以官方文档、本地 Eve skill 和安装包 docs 为准。

## 官方参考

- Eve introduction: `https://eve.dev/docs/introduction`
- vercel/eve: `https://github.com/vercel/eve`
- MCP protocol introduction: `https://modelcontextprotocol.io/docs/getting-started/intro`
- Kimi Code docs: `https://www.kimi.com/code/docs/`

## 验证

```bash
pnpm --filter @agent-template/agent-eve lint
pnpm --filter @agent-template/agent-eve test
pnpm --filter @agent-template/agent-eve typecheck
pnpm --filter @agent-template/agent-eve build
pnpm --filter @agent-template/agent-eve eve:info
```
