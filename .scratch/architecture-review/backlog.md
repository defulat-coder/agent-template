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

- 日期：2026-07-03
- locality：Agent job payload validation、runtime dispatch 和 execution result assembly 集中到 `packages/agent` 的 `runAgentJob`。
- leverage：Worker `handleAgentJob` 只作为 adapter 委派给 Agent job execution seam，后续接入真实 Claude/Eve execution 不需要把逻辑塞回 Worker。
- 聚焦验证：`vitest` 覆盖 `packages/agent` 和 `apps/worker`；`tsc`、`eslint` 和 `tsup` 覆盖受影响 packages。

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
