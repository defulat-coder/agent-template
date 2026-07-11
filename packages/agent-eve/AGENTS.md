# packages/agent-eve 协作指南

## 职责

`packages/agent-eve` 是基于官方 `vercel/eve` npm 包的 Eve filesystem-first runtime，`agent/` 是该 runtime 的 authored surface。

## 能力边界

- `src/` 放运行时加载、状态和执行边界。
- `agent/agent.ts` 使用 `eve` 导出的 `defineAgent` 放 runtime config。
- `EVE_AGENT_MODEL` 由 `src/config.ts` 统一读取，runtime state 和 `agent/agent.ts` 必须同源。
- `EVE_AGENT_HOST` 是 Eve execution adapter 连接官方 Eve HTTP API 的运行配置；未配置时 execution 返回 skipped。
- `checkEveAgentReadiness` 必须使用当前安装版本的官方 `Client.health()`，不在 API 重写 Eve health 协议。
- `EVE_AGENT_SERVICE_TOKEN` 是 API/Worker 到 Eve HTTP channel 的可选服务凭证；配置后 client 发送 `x-agent-template-eve-token`，Eve channel 校验该 header。
- Eve 本地服务默认监听 `13010`，API/Worker 通过 `EVE_AGENT_HOST` 连接；Docker 只用于显式容器模式。
- Kimi Code 通过 `@ai-sdk/anthropic` 的 Anthropic-compatible provider 接入 Eve authored surface。
- Eve 默认使用 `ANTHROPIC_BASE_URL=https://api.kimi.com/coding/`、`ANTHROPIC_MODEL=kimi-for-coding`、`ANTHROPIC_API_KEY`。
- Kimi 模型不是 Eve/AI Gateway catalog 内置模型，`agent/agent.ts` 必须显式设置 `modelContextWindowTokens` 和 `compaction.modelContextWindowTokens`，避免 Eve 编译期查不到 context window metadata。
- `agent/instructions.md` 放基础 system prompt。
- `agent/channels/eve.ts` 放 Eve HTTP route auth；不要删除 API service auth，否则 `@agent-template/agent-eve` client 会被 Eve session route 拒绝。
- `agent/tools/web_search.ts` 禁用 Eve provider-managed `web_search`；Kimi Anthropic-compatible stream 会返回缺少 `id` 的 server tool block，启用后会触发 Eve/AI SDK 类型校验失败。
- `agent/tools`、`agent/skills`、`agent/channels`、`agent/hooks`、`agent/sandbox`、`agent/subagents` 按 Eve 语义增长。
- 电商业务 Skill 以 Toolbox 官方 `skills-generate` 产物为来源，通过根目录 `pnpm skills:generate:toolbox` 同步到 Eve 与 Claude authored surface。
- 运行时 Skill 只安装适配后的 `SKILL.md`，并调用 `toolbox__*` connection tools；不要把官方生成的数据库直连脚本复制进 Agent skill 目录。
- Toolbox 通过 `agent/connections/toolbox.ts` 的 `defineMcpClientConnection` 直连；URL、Bearer token 与 Tool allowlist 读取 `@agent-template/toolbox-config`。
- Eve 的 Toolbox 工具使用官方 `defineDynamic` 在 `session.started` 按 `AGENT_CAPABILITY_PROFILE` 解析；profile 由部署环境选择，不从模型输入或普通请求参数读取。
- Eve stream 事件需要转换成 shared `AgentRunEvent`，至少覆盖 `message.completed`、`actions.requested`、`action.result` 和失败事件，保证 API Chat SSE 与前端 timeline 可用。
- `actions.requested` / `action.result` 必须投影同一 `callId/toolName`；缺失关联字段时输出 `unknown`，不要伪造 Tool identity。
- Eve 本地生成的 `.eve/`、`.output/` 和 `.workflow-data/` 不提交，也不能进入 Vitest 扫描面。
- `eve` 依赖的 package spec 保持 `latest`，不要改成固定版本、`^x.y.z` 或 major range；该框架迭代快，按用户要求跟随 npm latest tag。
- 开发 Eve runtime、authored surface 或相关测试前，先使用 `.codex/skills/eve`。
- 涉及 API 细节时必须读取当前安装版本的 `node_modules/eve/docs/README.md` 和相关文档。

## 不应该做

- 不实现 runtime selector；selector 留在 `@agent-template/agent`。
- 不让 `apps/*` 直接依赖这个包。
- 不把 Claude SDK 逻辑写进这里。
- 不把 Kimi API Key 写入仓库。
- 不把 PostgreSQL 连接信息或 Toolbox `tools.yaml` 复制进 Eve runtime package；数据库权限留在 `apps/toolbox`。
- 不恢复 authored wrapper tools 或共享 MCP Host；Eve connection 负责本 runtime 的 MCP client lifecycle。
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
