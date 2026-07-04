# 架构候选 backlog

来源：`improve-codebase-architecture` 评审，按 `codebase-design` 的 module / interface / depth / seam / adapter / leverage / locality 词汇维护。

## 候选

| 状态 | 议题 | 强度 | 下一步 |
| --- | --- | --- | --- |
| completed | 收拢 Agent job intake module | Strong | API route 已穿过 `AgentJobIntake` interface，BullMQ lifecycle 留在 implementation 内 |
| completed | 压窄 Worker runtime seam | Worth exploring | BullMQ event name 已留在 adapter 内，runtime 测试穿过回调 interface |
| completed | 修正 Worker payload validation seam | Worth exploring | `handleAgentJob` interface 已接收 `unknown`，validation 留在 implementation 内 |
| completed | 集中 Agent runtime env config seam | Strong | Agent runtime env 由 `packages/agent` 统一维护，API/Worker env module 只组合该 seam |
| completed | Deepen Agent runtime execution module | Strong | `runAgentJob` 已成为 Worker 调用的 Agent job execution seam |
| completed | 收拢 Eve Agent runtime model 来源 | Strong | `src/config.ts` 同时驱动 runtime state 和 `agent/agent.ts` |
| completed | 接入真实 runtime execution adapter | Strong | `runAgentJob` dispatch 到 Claude/Eve runtime package；未配置返回 skipped |
| completed | 删除 Worker job-handler pass-through | Worth exploring | Worker runtime 直接委派 `runAgentJob` |
| completed | 建立 Agent run event producer seam | Speculative | runtime adapter 返回原始 events；streaming/store 暂不新增 |
| completed | Define shared Agent run event protocol | Worth exploring | Agent run event protocol 和 normalizer 已移入 `packages/shared` |
| completed | Narrow Agent job HTTP contract duplication | Speculative | Agent job accepted metadata schema 已移入 `packages/shared`，Web/API 共用 |
| deferred | 收拢 Queue runtime knowledge | Worth exploring | 当前只有两个装配点；继续抽象会形成 shallow module |
| deferred | 集中 Health display locality | Speculative | 等第二个页面或测试重复使用 health panel 映射 |

## 执行规则

- 每轮只处理一个可执行候选。
- 每轮必须做聚焦验证。
- 每轮完成后用中文 Conventional Commit 提交。

## 已完成

### 收拢 Agent job intake module

- 日期：2026-07-02
- locality：`/agent/jobs` route 不再知道 Redis URL 或 BullMQ queue lifecycle。
- leverage：route-level 测试可替换 `AgentJobIntake` adapter。
- 聚焦验证：`pnpm --filter @agent-template/api lint`、`pnpm --filter @agent-template/api typecheck`、`pnpm --filter @agent-template/api test`

### 压窄 Worker runtime seam

- 日期：2026-07-02
- locality：BullMQ event name 留在 Worker adapter implementation 内。
- leverage：runtime 测试穿过 `onCompleted` / `onFailed` 回调 interface，不再模拟 `.on("completed")`。
- 聚焦验证：`pnpm --filter @agent-template/worker lint`、`pnpm --filter @agent-template/worker typecheck`、`pnpm --filter @agent-template/worker test`

### 修正 Worker payload validation seam

- 日期：2026-07-02
- locality：queued payload 的 trust check 集中在 `handleAgentJob` implementation。
- leverage：调用方不需要假装 queue data 已经通过 schema。
- 聚焦验证：`pnpm --filter @agent-template/worker lint`、`pnpm --filter @agent-template/worker typecheck`、`pnpm --filter @agent-template/worker test`

### 集中 Agent runtime env config seam

- 日期：2026-07-03
- locality：`AGENT_RUNTIME`、Claude runtime env 和 Eve runtime env 集中在 `packages/agent` 的 `AgentRuntimeEnvSchema`。
- leverage：API health、Worker execution 和 runtime selector 测试穿过同一个 env seam；`EVE_AGENT_MODEL` 不再被 app env schema 丢弃。
- 聚焦验证：`vitest` 覆盖 `packages/agent`、`apps/api`、`apps/worker`；`tsc`、`eslint` 和 `tsup` 覆盖受影响 packages。

### Deepen Agent runtime execution module

- 日期：2026-07-04
- locality：Agent job payload validation、runtime dispatch、execution result assembly 和 runtime adapter 调用集中到 `packages/agent` 的 `runAgentJob`。
- leverage：Worker 只穿过一个 Agent job execution seam；Claude/Eve execution 差异留在各自 runtime package。
- 聚焦验证：`pnpm --filter @agent-template/agent test`、`pnpm --filter @agent-template/agent typecheck`、`pnpm --filter @agent-template/worker test`、`pnpm --filter @agent-template/worker typecheck`

### 收拢 Eve Agent runtime model 来源

- 日期：2026-07-04
- locality：`EVE_AGENT_MODEL` 读取集中到 `packages/agent-eve/src/config.ts`，runtime state 和 Eve authored surface 不再分裂。
- leverage：一个测试面能证明 runtime state 和 loaded `defineAgent` 使用同一 model source。
- 聚焦验证：`pnpm --filter @agent-template/agent-eve test`、`pnpm --filter @agent-template/agent-eve typecheck`

### 接入真实 runtime execution adapter

- 日期：2026-07-04
- locality：Claude execution 留在 `packages/agent-claude`，Eve execution 留在 `packages/agent-eve`，`packages/agent` 只做 dispatch。
- leverage：配置后可穿过 Claude SDK `query` 或官方 Eve `Client`；未配置时返回 `status: "skipped"`，本地模板不要求外部凭据。
- 聚焦验证：`pnpm --filter @agent-template/agent-claude test`、`pnpm --filter @agent-template/agent-claude typecheck`、`pnpm --filter @agent-template/agent-eve test`、`pnpm --filter @agent-template/agent-eve typecheck`、`pnpm --filter @agent-template/agent test`、`pnpm --filter @agent-template/agent typecheck`

### 删除 Worker job-handler pass-through

- 日期：2026-07-04
- deletion test：删除 `apps/worker/src/job-handler.ts` 没有把 complexity 推回多个调用方；Worker runtime 直接委派 `runAgentJob` 更深。
- leverage：Worker 测试保留在 `createAgentWorkerRuntime` interface，不再重复测试 Agent runtime selector。
- 聚焦验证：`pnpm --filter @agent-template/worker test`、`pnpm --filter @agent-template/worker typecheck`

### 建立 Agent run event producer seam

- 日期：2026-07-04
- locality：runtime adapter 已经拿到的 Claude SDK messages 和 Eve stream events 通过 `AgentJobResult.events` 返回。
- leverage：后续需要 UI timeline 时可从 job result/store 接入 shared event normalizer；当前不新增 streaming endpoint 或持久化 store。
- 聚焦验证：`pnpm --filter @agent-template/agent test`、`pnpm --filter @agent-template/agent-eve test`、对应 typecheck

### Define shared Agent run event protocol

- 日期：2026-07-03
- locality：Agent run event protocol、artifact schema 和 event normalizer 集中到 `packages/shared`。
- leverage：Web timeline 渲染共享协议，未来 Worker/runtime 产出事件时不需要和 Web 本地协议手工对齐。
- 聚焦验证：`vitest` 覆盖 `packages/shared` 和 `apps/web`；`tsc`、`eslint`、shared build 和 Web build 通过。

### Narrow Agent job HTTP contract duplication

- 日期：2026-07-03
- locality：Agent job accepted metadata schema 集中到 `packages/shared`，Web/API 不再分别定义返回 shape。
- leverage：Web trust boundary 使用 shared schema parse 后端 JSON，API intake 使用同一 schema 生成 acceptance metadata。
- 聚焦验证：`vitest` 覆盖 shared schema、Web client、API intake；`tsc`、`eslint`、shared build、API build 和 Web build 通过。

## 暂缓

### 收拢 Queue runtime knowledge

- 日期：2026-07-02
- deletion test：删除一个新 queue runtime module 只会把少量 BullMQ wiring 移回 API 和 Worker，不会集中足够 complexity。
- seam 判断：当前只有 API queue adapter 和 Worker adapter 两个使用点，`createBullMqConnectionOptions` 已集中 Redis URL parsing。
- 重新打开条件：新增第三个 queue consumer、queue option 规则继续增长，或 Redis/BullMQ adapter 需要被测试替换。
