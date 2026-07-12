# packages/agent-eve 协作指南

## 职责

`packages/agent-eve` 是官方 Eve filesystem-first app；package 根是 app root，`agent/` 使用官方推荐的 nested authored surface。

## 能力边界

- `src/` 放运行时加载、状态和执行边界。
- `agent/agent.ts` 使用 `eve` 导出的 `defineAgent` 放 runtime config。
- `EVE_AGENT_MODEL` 由 `src/config.ts` 统一读取，runtime state 和 `agent/agent.ts` 必须同源。
- `EVE_AGENT_HOST` 是 Eve execution adapter 连接官方 Eve HTTP API 的运行配置；未配置时 execution 返回 skipped。
- `checkEveAgentReadiness` 必须使用当前安装版本的官方 `Client.health()`，不在 API 重写 Eve health 协议。
- 未配置服务 Token 的非生产 loopback 开发由官方 `localDev()` 处理；生产或已配置 Token 时必须关闭该入口。Docker Eve runtime 与非 loopback 服务调用必须配置 `EVE_AGENT_SERVICE_TOKEN`，使用恒定时间比较校验 `x-agent-template-eve-token`，Client 必须拒绝 HTTP redirect。
- Eve 本地服务默认监听 `13010`，API/Worker 通过 `EVE_AGENT_HOST` 连接；Docker 只用于显式容器模式。
- Kimi Code 通过 `@ai-sdk/anthropic` 的 Anthropic-compatible provider 接入 Eve authored surface。
- Eve 默认使用 `ANTHROPIC_BASE_URL=https://api.kimi.com/coding/`、`ANTHROPIC_MODEL=kimi-for-coding`、`ANTHROPIC_API_KEY`。
- Kimi 模型不是 Eve/AI Gateway catalog 内置模型，`agent/agent.ts` 必须显式设置 `modelContextWindowTokens` 和 `compaction.modelContextWindowTokens`，避免 Eve 编译期查不到 context window metadata。
- `agent/instructions.md` 放基础 system prompt。
- `agent/channels/eve.ts` 放 Eve HTTP route auth；不要删除 API service auth，否则 `@agent-template/agent-eve` client 会被 Eve session route 拒绝。
- `agent/tools/` 显式禁用不需要的 `bash`、`web_fetch`、`web_search`、`write_file`；保留只读文件工具供 packaged Skill 读取 references。
- `agent/sandbox.ts` 固定使用官方 `justbash()` 后端；该 Agent 只需隔离虚拟文件系统，不依赖 Docker、VM、真实二进制或 sandbox 网络。
- `agent/skills`、`agent/connections`、`agent/channels`、`agent/hooks`、`agent/sandbox`、`agent/subagents` 按 Eve filesystem slot 语义增长。
- 电商业务 Skill 以 Toolbox 官方 `skills-generate` 产物为来源，通过根目录 `pnpm skills:generate:toolbox` 同步到 Eve 与 Claude authored surface。
- Eve 侧生成 `defineDynamic` + `defineSkill` TypeScript package，把对应领域语义目录作为 inline sibling file；在 `session.started` 直接按 capability activation 的 `enabledSkills` 暴露 Skill，不再从 Tool 子集反推 Skill。
- 运行时 Skill 只调用 `toolbox__*` connection tools；不要把官方生成的数据库直连脚本复制进 Agent Skill。
- Toolbox 通过 `agent/connections/toolbox.ts` 的 `defineMcpClientConnection` 直连；URL、Bearer token 与 Tool allowlist 读取 `@agent-template/toolbox-config`。
- Toolbox connection 在 Eve app 启动时按部署环境的 `AGENT_CAPABILITY_PROFILE` 建立静态 allowlist，动态 Skill 使用同一次 activation 的 Skill slug；不要把 profile 作为模型输入或普通请求参数。
- Eve stream 事件需要转换成 shared `AgentRunEvent`，至少覆盖 `message.completed`、`actions.requested`、`action.result` 和失败事件，保证 API Chat SSE 与前端 timeline 可用。
- `actions.requested` / `action.result` 必须投影同一 `callId/toolName`；缺失关联字段时输出 `unknown`，不要伪造 Tool identity。
- Eve 本地生成的 `.eve/`、`.output/` 和 `.workflow-data/` 不提交，也不能进入 Vitest 扫描面。
- `eve` 依赖的 package spec 保持 `latest`，不要改成固定版本、`^x.y.z` 或 major range；该框架迭代快，按用户要求跟随 npm latest tag。
- 开发 Eve runtime、authored surface 或相关测试前，先使用 `eve` Skill。
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

- Eve project layout: `https://eve.dev/docs/reference/project-layout`
- Eve instructions and default harness: `https://eve.dev/docs/instructions`, `https://eve.dev/docs/concepts/default-harness`
- Eve dynamic capabilities: `https://eve.dev/docs/guides/dynamic-capabilities`
- Eve auth, security and sandbox: `https://eve.dev/docs/guides/auth-and-route-protection`, `https://eve.dev/docs/concepts/security-model`, `https://eve.dev/docs/sandbox`

## 验证

```bash
pnpm --filter @agent-template/agent-eve lint
pnpm --filter @agent-template/agent-eve test
pnpm --filter @agent-template/agent-eve typecheck
pnpm --filter @agent-template/agent-eve build
pnpm --filter @agent-template/agent-eve eve:info
```
