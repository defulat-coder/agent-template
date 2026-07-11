# packages/agent 协作指南

## 职责

`packages/agent` 是 Agent runtime 公共边界，负责解析 runtime env、选择 runtime，并维护 Agent run lifecycle。

## 能力边界

- `AgentRuntimeEnvSchema` / `parseAgentRuntimeEnv` 统一维护 Agent runtime 相关环境变量。
- `getAgentRuntimeStateFromEnv` 返回当前 runtime、配置状态和模型。
- `checkAgentRuntimeReadinessFromEnv` 只探测部署选择的 runtime，并以短超时返回 shared dependency state。
- `runAgent` 是 Chat SSE 和 Worker 共同调用的 Agent run execution seam，负责 run input validation、runtime dispatch 和 execution result assembly。
- `createAgentRunLifecycle` 负责 create/start/event/terminal/cancel 状态机；存储只通过 `AgentRunRepository` interface。
- 具体实现通过 dynamic import 委派给 `AGENT_RUNTIME` 选中的 package；同步 state 解析不得触发两套 runtime 加载。
- runtime adapter 已产生的 Agent run event 按序持久化并通过 `AgentRunResult.events` 透出。
- Toolbox 连接信息只作为 runtime-owned MCP Client 配置透传；不要在公共 selector 内读取 `apps/toolbox/tools.yaml` 或创建 MCP Client。

## 不应该做

- 不在这里处理 HTTP 请求。
- 不在这里处理 BullMQ job 生命周期或 Prisma 查询细节。
- 不把具体业务 prompt 或产品逻辑写进公共 agent package。
- 不从 request payload 或 job payload 覆盖 runtime；runtime 只读 `AGENT_RUNTIME`。
- 不要求本地开发必须配置 `ANTHROPIC_API_KEY`。
- 不把未配置 runtime 伪装成已执行成功；返回 `status: "skipped"`。
- 不把 Toolbox server 当成第三套 Agent runtime；Claude/Eve 分别使用原生 MCP Client 直连它。
- 不让调用方各自实现 Agent run 状态机；Chat 与 queued job 必须穿过同一 lifecycle。
- 不恢复 concrete runtime 的顶层 value import；测试替换 loader，构建用 `pnpm agent-runtime:check:bundle` 检查分块。

## 验证

```bash
pnpm --filter @agent-template/agent lint
pnpm --filter @agent-template/agent test
pnpm --filter @agent-template/agent typecheck
pnpm --filter @agent-template/agent build
```
