# 架构候选 backlog

来源：`improve-codebase-architecture` 评审，按 `codebase-design` 的 module / interface / depth / seam / adapter / leverage / locality 词汇维护。

## 候选

| 状态       | 议题                                       | 强度            | 下一步                                                                                  |
| ---------- | ------------------------------------------ | --------------- | --------------------------------------------------------------------------------------- |
| completed  | 收拢 Agent job intake module               | Strong          | API route 已穿过 `AgentJobIntake` interface，BullMQ lifecycle 留在 implementation 内    |
| completed  | 压窄 Worker process seam                   | Worth exploring | BullMQ event name 已留在 adapter 内，process 测试穿过回调 interface                     |
| completed  | 修正 Worker payload validation seam        | Worth exploring | `handleAgentJob` interface 已接收 `unknown`，validation 留在 implementation 内          |
| completed  | 集中 Agent runtime env config seam         | Strong          | Agent runtime env 由 `packages/agent` 统一维护，API/Worker env module 只组合该 seam     |
| completed  | Deepen Agent runtime execution module      | Strong          | `runAgent` 已成为 Chat SSE 和 Worker 共同调用的 Agent run execution seam                |
| completed  | 引入 Agent run，收窄 Agent job             | Strong          | `Agent job` 只表示 queued request；Chat SSE 和 Worker 共用 `Agent run` interface        |
| completed  | 拆清 Web Agent client 命名                 | Worth exploring | `agent-job-client` 已改为 `agent-client`，同时覆盖 Chat SSE 和 queued job intake        |
| completed  | 减少 Worker runtime 与 Agent runtime 重名  | Worth exploring | Worker 侧改称 `AgentWorkerProcess`；`runtime` 留给 Agent implementation selector        |
| completed  | 收拢 Eve Agent runtime model 来源          | Strong          | `src/config.ts` 同时驱动 runtime state 和 `agent/agent.ts`                              |
| completed  | 接入真实 runtime execution adapter         | Strong          | `runAgent` dispatch 到 Claude/Eve runtime package；未配置返回 skipped                   |
| completed  | 删除 Worker job-handler pass-through       | Worth exploring | Worker process 直接委派 `runAgent`                                                      |
| completed  | 建立 Agent run event producer seam         | Speculative     | runtime adapter 返回原始 events；streaming/store 暂不新增                               |
| completed  | 收拢 Agent run event producer seam         | Strong          | Claude/Eve adapter 输出 shared `AgentRunEvent`，raw SDK events 留在 implementation 内   |
| completed  | 删除 legacy Agent run event normalizer     | Strong          | shared 只保留 `AgentRunEvent` schema/type；raw protocol mapping 留在 runtime adapter    |
| completed  | Define shared Agent run event protocol     | Worth exploring | Agent run event protocol 和 normalizer 已移入 `packages/shared`                         |
| completed  | Narrow Agent job HTTP contract duplication | Speculative     | Agent job accepted metadata schema 已移入 `packages/shared`，Web/API 共用               |
| deferred   | 收拢 Queue runtime knowledge               | Worth exploring | 当前只有两个装配点；继续抽象会形成 shallow module                                       |
| deferred   | 集中 Health display locality               | Speculative     | 等第二个页面或测试重复使用 health panel 映射                                            |
| completed  | 收拢 Toolbox Tool 分类与准入 matrix        | Strong          | 平台运维、认证业务问数和未来 compiler 的 interface 已集中到智能问数标准                 |
| superseded | 收紧 MCP Host 授权边界                     | Strong          | MCP Host 已删除；授权由 Toolbox OIDC、Tool scope 与数据库强制                           |
| completed  | 建立 Agent capability profile seam         | Strong          | Profile 同源投影到 Claude SDK policy 与 Eve connection `tools.allow`                    |
| completed  | 深化业务语义查询契约                       | Strong          | 语义目录由共享 schema 校验并随业务 Skill 投影，不隐式改写 Tool 返回值                   |
| completed  | 建立原生 MCP 本地验收 seam                 | Strong          | 默认本机 migration/seed + 临时官方 Toolbox；Docker 只保留显式入口                       |
| completed  | 补齐列表分页与空结果 interface             | Worth exploring | 稳定 LIMIT/OFFSET + totalCount，Skill 规定分页与可操作空结果回答                        |
| completed  | 集中 Toolbox 可观测性启动策略              | Worth exploring | 临时启动器统一 JSON、SQLCommenter、OTLP env 与 service name                             |
| completed  | 统一本地验证文档边界                       | Strong          | 根规则与 Toolbox 文档不再把 Docker 描述为默认路径                                       |
| completed  | 由 Agent runtime 持有 MCP Client           | Strong          | Claude/Eve 各自使用框架原生 Client，共享包只持有配置与 schema                           |
| completed  | 阻止 Toolbox token 进入 Claude subprocess  | Strong          | ambient Toolbox env 在创建 Claude subprocess env 时显式删除并有回归测试                 |
| completed  | 恢复 Toolbox 执行级时间窗护栏              | Strong          | PostgreSQL 统一拒绝反向或超过 31 天的窗口，原生 MCP 验收穿过真实 seam                   |
| completed  | 建立持久化 Agent run lifecycle             | Strong          | Chat/Queue 共用状态机与 PostgreSQL record，BullMQ 只投递 `runId`                        |
| completed  | 建立所选 Agent runtime readiness           | Strong          | Claude 校验 MCP capability，Eve 使用官方 health；API 只聚合 shared state                |
| completed  | 收紧 Agent run event/result 协议不变量     | Strong          | Tool event 关联 call/name；terminal result 按 status 强制必需字段                       |
| completed  | 按部署选择动态加载 runtime adapter         | Strong          | 公共 selector 保留同步 config，execution/readiness 只加载所选 adapter                   |
| completed  | 修正 ADR 与模块规则的 Host 漂移            | Strong          | superseded ADR 仅保留历史；当前规则统一指向 runtime-owned MCP 与 Toolbox 授权           |
| completed  | 隔离平台数据库与 Ecommerce fixture         | Strong          | 平台留在 `public`；fixture 独立 package/schema/migration/seed，Tool SQL 显式限定 schema |
| completed  | 收紧 Agent job queue payload seam          | Strong          | BullMQ 只携带 `runId`；Worker process 强制注入 lifecycle resume，不保留 runtime 旁路    |
| completed  | 收紧 Ecommerce baseline eligibility        | Strong          | 五张 fixture 表必须全有或全无；部分 schema drift fail closed，并有真实数据库负向验证    |
| completed  | 同步 Toolbox 生成产物                      | Strong          | production 配置、官方原始 Skill 与 runtime Skill 均由同一事实源生成并通过 stale gate    |
| completed  | 固定 Toolbox UTC 日桶                      | Strong          | 销售日显式按 UTC 转换，不再依赖 PostgreSQL session timezone                             |
| completed  | 规范化 Toolbox MCP URL                     | Worth exploring | `/mcp/` 与 `/mcp` 归一为一个 MCP path，Claude/Eve 共享 parser 不再重复追加              |
| completed  | 收紧认证连接 capability profile            | Strong          | Bearer token 连接必须显式选择岗位 profile，不允许 `development-all` fail-open           |
| completed  | 收窄本地 Toolbox 容器暴露面                | Worth exploring | 宿主机 MCP 端口只绑定 loopback，容器网络访问保持不变                                    |

## 执行规则

- 每轮只处理一个可执行候选。
- 每轮必须做聚焦验证。
- 每轮完成后用中文 Conventional Commit 提交。

## 已完成

### 收紧 Ecommerce baseline eligibility

- 日期：2026-07-11
- locality：已有库 baseline eligibility 集中在 fixture migration runner，明确验证五张业务表的完整集合。
- deletion test：单表哨兵无法封装迁移前置条件；删除它并吸收为完整 inventory 检查后，迁移状态与数据库状态重新同源。
- leverage：同一 fail-closed seam 同时保护本地、CI 和生产 deploy；部分 schema 不会被误标为已完成。
- 聚焦验证：临时 PostgreSQL 数据库构造单表残留，`pnpm db:verify:fixture:partial` 必须观察到 migration 拒绝 baseline；空库和完整旧库路径继续通过。

### 收紧 Agent job queue payload seam

- 日期：2026-07-11
- locality：Agent job 的 prompt、requestedAt 与终态只保存在 Agent run record；BullMQ payload interface 只剩 `runId`。
- deletion test：删除 Worker process 的默认 runtime 调用会消除绕过持久化 lifecycle 的第二条执行路径，而不会把复杂度移到别处。
- leverage：API intake、BullMQ queue 与 Worker process 共用单字段 schema；生产装配和测试都必须显式注入 `AgentRunLifecycle.resume`。
- 聚焦验证：shared、API、Worker 的 lint/typecheck/test/build；`pnpm agent-runs:verify:local` 验证真实 PostgreSQL lifecycle。

### 隔离平台数据库与 Ecommerce fixture

- 日期：2026-07-11
- locality：`packages/db` 只拥有平台 `public` model；`packages/ecommerce-fixture` 独立拥有 schema、Client、baseline、seed 与确定性数据生成。
- deletion test：电商 model 留在平台 Client 会让可复用模板永久携带业务假设；独立 package 删除后平台 Agent run lifecycle 仍完整，因此该 seam 有真实可替换性。
- leverage：根数据库命令统一编排两个 migration history，Toolbox SQL 显式 schema qualification；同一真实 MCP 验收继续覆盖 18 Tool 与 10 个业务场景。
- 聚焦验证：两 package lint/typecheck/test/build；幂等 `pnpm db:deploy`/`db:seed`；当前库 boundary 检查与临时空库独立重建；`pnpm toolbox:check` 与 `pnpm toolbox:verify:local`，未使用 Docker。

### 修正 ADR 与模块规则的 Host 漂移

- 日期：2026-07-11
- locality：ADR 0002/0006 与 Web/Toolbox/Claude 协作规则统一到 ADR 0007；ADR 0003/0005 明确标记为非规范性历史决策。
- deletion test：保留冲突规则会让后续 Agent 同时尝试 runtime-owned MCP 与已删除 Host bridge，因此文档一致性直接影响代码架构。
- leverage：Tool visibility、Toolbox OIDC/scope、数据库授权和交互式 UI 未决边界分别只有一个规范来源；Cloud/Claude 命名同步领域语言。
- 聚焦验证：全仓非 Skill Markdown 漂移扫描、ADR 链接检查、`git diff --check`。

### 按部署选择动态加载 runtime adapter

- 日期：2026-07-11
- locality：`packages/agent` 维护 selector 与 loader interface；Claude/Eve config、execution、readiness 留在各自 dynamic module，apps 不依赖 concrete runtime。
- deletion test：恢复顶层 value import 会让 API/Worker 启动时同时装载两套框架，因此 dynamic seam 直接降低部署耦合和启动副作用。
- leverage：execution 与 health 共用同一选择规则；单元测试证明未选择 loader 不调用，构建门禁证明 API/Worker entry 与两套 runtime chunk 分离。
- 聚焦验证：shared/Claude/Eve/Agent/API/Worker lint、typecheck、test；`pnpm agent-runtime:check:bundle`，未使用 Docker。

### 收紧 Agent run event/result 协议不变量

- 日期：2026-07-11
- locality：Claude/Eve 私有事件在各自 adapter 内关联；shared package 只发布 `callId/toolName` 与 status-discriminated result，Web/DB 不解释 runtime 原始字段。
- deletion test：单一 `tool` 字段无法同时表达 invocation id 与 Tool name，所有 terminal 字段可选会把无 output/reason 的非法状态传播到 UI，因此协议不变量属于必要 interface。
- leverage：SSE、PostgreSQL event store、Web timeline 和两套 runtime 共用同一可验证协议；queued/running cancellation 使用专用 event，不再冒充 error。
- 聚焦验证：shared/Claude/Eve/Agent/API/Worker/Web lint、typecheck、test；本机 migration deploy 与 `pnpm agent-runs:verify:local`，未使用 Docker。

### 建立所选 Agent runtime readiness

- 日期：2026-07-11
- locality：runtime selector 只选择一个 readiness adapter；Claude 负责 transient MCP capability probe，Eve 负责官方 `Client.health()`，API 只聚合结果。
- deletion test：只保留 `configured` 会把凭据存在误报为服务可用；把协议探测写进 API 又会泄漏 runtime 细节，因此 readiness interface 保留在 Agent runtime 边界。
- leverage：同一 `/health` schema 区分配置与可用性，超时后降级但不挂起；不发送模型 prompt，不产生外部推理费用。
- 聚焦验证：shared/Claude/Eve/Agent/API lint、typecheck、test；真实临时 Toolbox MCP capability probe；真实本地 Eve server 官方 health，均未使用 Docker。

### 收窄本地 Toolbox 容器暴露面

- 日期：2026-07-11
- locality：容器内监听与宿主机暴露分别留在 Compose adapter 两侧；API/Worker/Eve 继续走内部网络，宿主机只允许 loopback。
- deletion test：删除 loopback host binding 会让无 OIDC 的开发 MCP endpoint 重新暴露到所有网卡，因此该限制属于容器 adapter 的必要安全配置。
- leverage：不改变 runtime URL、Toolbox 配置或容器间调用即可收窄外部 interface。
- 聚焦验证：YAML 解析和 host port 精确断言，不启动 Docker。

### 收紧认证连接 capability profile

- 日期：2026-07-11
- locality：认证连接的最小可见性 invariant 集中在 `parseToolboxAgentConfig`，Claude/Eve adapter 无需重复判断。
- deletion test：删除该 invariant 会让漏配 profile 的 Bearer token 连接重新暴露全部 Tool，因此该检查属于共享配置 module 的必要 implementation。
- leverage：两个 runtime 和所有生产入口同时 fail-closed；无认证本地开发仍保留 `development-all` 默认。
- 聚焦验证：toolbox-config lint/typecheck/test、Agent/Claude/Eve tests。

### 规范化 Toolbox MCP URL

- 日期：2026-07-11
- locality：尾斜杠处理集中在 `parseToolboxAgentConfig`，Claude 与 Eve adapter 不再各自承担 URL 纠错。
- deletion test：删除共享规范化会让 `/mcp/` 重新变为 `/mcp/mcp`，错误同时扩散到两个 runtime。
- leverage：一个共享 interface 测试覆盖两个 MCP Client adapter。
- 聚焦验证：toolbox-config lint/typecheck/test。

### 建立持久化 Agent run lifecycle

- 日期：2026-07-11
- locality：create/start/event/terminal/cancel 状态机集中在 `packages/agent`；Prisma package 只实现 repository 原子读写，API/Worker 只做装配。
- deletion test：删除该 lifecycle 会让 Chat、Queue、Worker 各自维护状态并把 BullMQ/SSE transport 状态误当业务事实，因此保留一个深 module。
- leverage：Chat SSE 与 queued job 共用 durable run record、ordered events、结果查询和协作式取消；BullMQ retry 始终恢复同一 `runId`。
- 聚焦验证：Agent/Claude/Eve/API/Worker/Web/shared/db lint、typecheck、test；`pnpm agent-runs:verify:local` 穿过本机 PostgreSQL，无 Docker。

### 固定 Toolbox UTC 日桶

- 日期：2026-07-11
- locality：`summarize-ecommerce-sales-by-day` 在 SQL 内显式将 `paidAt` 转为 UTC 日期，Business semantic catalog 使用同一口径。
- deletion test：删除该转换会让 session timezone 重新进入业务指标 interface，因此显式 UTC 转换属于查询 module 的必要 implementation。
- leverage：所有 Claude/Eve 调用方和 production 配置共享同一自然日语义；静态语义门禁阻止回归。
- 聚焦验证：非 UTC session 对照查询、`pnpm toolbox:check`。

### 同步 Toolbox 生成产物

- 日期：2026-07-11
- locality：`apps/toolbox/tools.yaml` 的时间窗 invariant 已投影到 production 配置和四个官方原始 Skill，runtime Skill 继续由同一生成 module 管理。
- deletion test：删除生成 gate 会重新允许 source、production 和 Skill 资产各自漂移，因此该 gate 继续保留。
- leverage：一次 `pnpm toolbox:check` 同时验证 production、Claude、Eve 与官方原始 Skill 输出。
- 聚焦验证：Node 24 下 `pnpm toolbox:check`。

### 恢复 Toolbox 执行级时间窗护栏

- 日期：2026-07-11
- locality：跨参数时间窗 invariant 集中到 PostgreSQL `validate_toolbox_time_window`，Claude/Eve 原生 MCP Client 无需重复 wrapper。
- deletion test：删除旧 `packages/shared/src/mcp-toolbox.ts` 后，运行时复杂度没有回到调用方；旧 schema 原本只被验收脚本使用，并未保护真实 Tool 调用。
- leverage：12 个时间窗 Tool 共享一个数据库 guard；静态语义门禁强制后续 `from/to` Tool 接入同一 seam。
- 聚焦验证：`pnpm toolbox:check:semantic`、shared lint/typecheck/test、`pnpm toolbox:verify:local`；反向窗口与超过 31 天窗口均由真实 MCP 调用拒绝。

### 收拢 Toolbox Tool 分类与准入 matrix

- 日期：2026-07-11
- locality：`INTELLIGENT_QUERY.md`、Toolbox 协作规则和 ADR 共同声明 Tool 分类、执行层选择与准入 interface，不再要求调用方跨文档做口头判断。
- leverage：后续认证业务问数 Tool 只需穿过一份 matrix 完成语义目录、Skill、golden cases 与可信身份要求；平台运维 Tool 不再错误承担业务语义义务。
- seam：Toolset 被明确为生成与上下文分组；真实授权仍在 Host `allowedTools` 与数据库权限 seam。部署级 Agent capability profile 已实现为模型可见性收窄，不冒充授权。
- 聚焦验证：`pnpm toolbox:check`、`git diff --check`

### 收拢 Agent job intake module

- 日期：2026-07-02
- locality：`/agent/jobs` route 不再知道 Redis URL 或 BullMQ queue lifecycle。
- leverage：route-level 测试可替换 `AgentJobIntake` adapter。
- 聚焦验证：`pnpm --filter @agent-template/api lint`、`pnpm --filter @agent-template/api typecheck`、`pnpm --filter @agent-template/api test`

### 压窄 Worker process seam

- 日期：2026-07-02
- locality：BullMQ event name 留在 Worker adapter implementation 内。
- leverage：process 测试穿过 `onCompleted` / `onFailed` 回调 interface，不再模拟 `.on("completed")`。
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
- locality：Agent run input validation、runtime dispatch、execution result assembly 和 runtime adapter 调用集中到 `packages/agent` 的 `runAgent`。
- leverage：Chat SSE 和 Worker 只穿过一个 Agent run execution seam；Claude/Eve execution 差异留在各自 runtime package。
- 聚焦验证：`pnpm --filter @agent-template/agent test`、`pnpm --filter @agent-template/agent typecheck`、`pnpm --filter @agent-template/worker test`、`pnpm --filter @agent-template/worker typecheck`

### 引入 Agent run，收窄 Agent job

- 日期：2026-07-05
- locality：`Agent job` 只保留 queued request 和 BullMQ intake；`Agent run` 表示一次 Agent 执行。
- leverage：Chat SSE 和 Worker 共用 `runAgent` interface，不再把非队列 Chat 路径伪装成 job。
- 聚焦验证：`pnpm --filter @agent-template/shared test`、`pnpm --filter @agent-template/agent test`、`pnpm --filter @agent-template/api test`、`pnpm --filter @agent-template/web test`

### 拆清 Web Agent client 命名

- 日期：2026-07-05
- locality：Web transport module 名称从 `agent-job-client` 改为 `agent-client`，不再把 Chat SSE 路径误标成 queued job。
- leverage：Chat SSE 和 queued job intake 仍共享一个浏览器 client module；不提前拆两个 shallow module。
- 聚焦验证：`pnpm --filter @agent-template/web test`、`pnpm --filter @agent-template/web typecheck`、`pnpm --filter @agent-template/web lint`

### 减少 Worker runtime 与 Agent runtime 重名

- 日期：2026-07-05
- locality：Worker process lifecycle module 改为 `process.ts` / `AgentWorkerProcess`，`runtime` 只表示 Agent runtime selector。
- leverage：Worker process 和 Agent runtime 在 AGENTS 导航、测试和 public interface 中不再撞词。
- 聚焦验证：`pnpm --filter @agent-template/worker test`、`pnpm --filter @agent-template/worker typecheck`

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
- deletion test：删除 `apps/worker/src/job-handler.ts` 没有把 complexity 推回多个调用方；Worker process 直接委派 `runAgent` 更深。
- leverage：Worker 测试保留在 `createAgentWorkerProcess` interface，不再重复测试 Agent runtime selector。
- 聚焦验证：`pnpm --filter @agent-template/worker test`、`pnpm --filter @agent-template/worker typecheck`

### 建立 Agent run event producer seam

- 日期：2026-07-04
- locality：runtime adapter 已经拿到的 Claude SDK messages 和 Eve stream events 通过 `AgentRunResult.events` 返回。
- leverage：后续需要 UI timeline 时可从 run result/store 接入 shared event normalizer；当前不新增 streaming endpoint 或持久化 store。
- 聚焦验证：`pnpm --filter @agent-template/agent test`、`pnpm --filter @agent-template/agent-eve test`、对应 typecheck

### 收拢 Agent run event producer seam

- 日期：2026-07-04
- locality：Claude SDK messages 和 Eve stream events 不再穿过 `packages/agent` 泄漏到 Web；runtime adapter implementation 内映射为 shared `AgentRunEvent`。
- leverage：Worker/Web 只面对 `AgentRunEvent` interface，测试可直接断言 shared protocol。
- 聚焦验证：`pnpm --filter @agent-template/shared test`、`pnpm --filter @agent-template/agent-claude test`、`pnpm --filter @agent-template/agent-eve test`、`pnpm --filter @agent-template/agent test`、`pnpm --filter @agent-template/web test`，对应 typecheck，`pnpm lint`、`pnpm build`

### 删除 legacy Agent run event normalizer

- 日期：2026-07-05
- deletion test：删除 `normalizeAgentRunEvent` 没有把 complexity 推回调用方；raw event mapping 已经由 runtime adapter implementation 承担。
- locality：`packages/shared` 只维护 shared `AgentRunEvent` interface，不再知道旧 raw protocol。
- leverage：Web 和 Worker 只依赖 schema/type；runtime adapter 测试覆盖 raw-to-shared 映射。
- 聚焦验证：`pnpm --filter @agent-template/shared test`、`pnpm --filter @agent-template/shared typecheck`

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

## 本轮复审

### 2026-07-11 Agent runtime 直连 MCP 复审

- lifecycle locality：Claude SDK HTTP MCP server 与 Eve `defineMcpClientConnection` 各自持有连接生命周期；`@agent-template/toolbox-config` 不创建 Client 或代理调用。
- deletion test：删除 `packages/mcp-host`、API MCP routes 和 MCP App UI 后，没有把协议复杂度推回 API/Web；两套 runtime 原生 adapter 已完整吸收。
- security seam：Capability Profile 只收窄模型可见 Tool；Toolbox OIDC、Tool scope、受限数据库角色与 RLS/等效控制负责授权。
- token containment：Claude subprocess env 显式删除 `TOOLBOX_AUTH_TOKEN`、`TOOLBOX_URL` 和 `AGENT_CAPABILITY_PROFILE`；Eve token 只由 connection `auth.getToken` 提供。
- runtime evidence：Eve discovery manifest 发现 `connections/toolbox.ts`；本机匿名/认证两套原生 MCP 验收均通过，未使用 Docker。
- 复审报告：`$TMPDIR/agent-template-mcp-direct-architecture-review.html`。
- 复审结论：本轮新增 Strong 候选已修复，无待处理架构候选。

### 2026-07-11 MCP Toolbox 最终复审

- security seam：Host 缺少 allowlist 时拒绝启动；生产 OIDC、Tool scope 与可信 Bearer token 已有本地真实验收。
- capability seam：七个部署级 profile 均受 Host allowlist 上限约束；Claude 和 Eve 不再硬编码全量可见工具。
- semantic depth：九个认证业务查询有可执行 query contract；结果携带目录版本、指标/维度、参数、字段、限制和诚实的数据新鲜度状态。
- verification locality：默认门禁只使用本机 PostgreSQL、Node 与临时官方 Toolbox；Docker 代码仅能通过显式 `:docker` 命令进入。
- pagination correctness：原生 Tool 严格返回 `limit` 行，通过窗口 `totalCount` 支持 Host 精确计算分页，不依赖额外探测行。
- observability：JSON 日志、SQLCommenter 和可选 OTLP 由一个本地进程 seam 配置；认证和业务验收共用。
- 复审结论：本轮 Strong / Worth exploring 候选已清零；原有 Queue runtime 与 Health display 暂缓条件不受本次范围影响。

## 暂缓

### 收拢 Queue runtime knowledge

- 日期：2026-07-02
- deletion test：删除一个新 queue runtime module 只会把少量 BullMQ wiring 移回 API 和 Worker，不会集中足够 complexity。
- seam 判断：当前只有 API queue adapter 和 Worker adapter 两个使用点，`createBullMqConnectionOptions` 已集中 Redis URL parsing。
- 重新打开条件：新增第三个 queue consumer、queue option 规则继续增长，或 Redis/BullMQ adapter 需要被测试替换。
