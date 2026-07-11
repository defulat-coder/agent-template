本页面向已具备项目基础结构认知的开发者，聚焦 Agent Template 的持久化层：讲解 PostgreSQL 中的两个 Schema 边界、核心数据模型（平台运行时模型与电商 Fixture 模型）、它们对应的仓库实现，以及迁移/种子/验证流程。阅读后，读者能够判断一条数据应该落在 `public` 还是 `ecommerce_fixture`，理解 `AgentRun` 与 `AgentConversation` 的持久化语义，并知道如何安全地变更数据库结构。

Sources: [AGENTS.md](packages/db/AGENTS.md), [AGENTS.md](packages/ecommerce-fixture/AGENTS.md)

## 持久化层总览：两个 Schema 的隔离

项目把数据库拆成两个 PostgreSQL Schema，并分别由两个工作区包独立拥有：

- `public`：平台持久化，归属 `@agent-template/db`，保存 `TemplateEvent`、`AgentRun`、`AgentRunEvent`、`AgentConversation` 等核心运行时数据。
- `ecommerce_fixture`：仿真电商数据集，归属 `@agent-template/ecommerce-fixture`，用于 Toolbox 与 MCP 的原生查询验证。

两者位于同一个数据库实例中，但使用各自独立的 Prisma Schema、Prisma Client、迁移历史与种子脚本。这种隔离通过 ADR-0012 固化，核心意图是：Fixture 数据可以随验证场景增删，而不会污染平台运行时模型。

Sources: [0012-isolated-ecommerce-fixture-schema.md](docs/adr/0012-isolated-ecommerce-fixture-schema.md#L7-L13), [schema.prisma](packages/db/prisma/schema.prisma#L8-L9), [schema.prisma](packages/ecommerce-fixture/prisma/schema.prisma#L8-L9)

```mermaid
flowchart TB
    subgraph PostgreSQL["PostgreSQL 数据库 project_template"]
        direction TB
        subgraph Public["public Schema"]
            PT[TemplateEvent]
            PR[AgentRun]
            PE[AgentRunEvent]
            PC[AgentConversation]
        end
        subgraph Fixture["ecommerce_fixture Schema"]
            FC[EcommerceCustomer]
            FP[EcommerceProduct]
            FO[EcommerceOrder]
            FI[EcommerceOrderItem]
            FPay[EcommercePayment]
        end
    end
    DB_PKG["@agent-template/db"]
    FIX_PKG["@agent-template/ecommerce-fixture"]
    DB_PKG -->|Prisma Client| Public
    FIX_PKG -->|Prisma Client| Fixture
```

## 平台 Schema（public）模型

平台 Schema 以“Agent Run”为中心，记录从请求、排队、执行、事件流直到最终结束的全过程。模型关系图如下：

```mermaid
erDiagram
    AgentRun {
        string id PK
        string conversationId FK
        string prompt
        datetime requestedAt
        datetime startedAt
        datetime completedAt
        datetime cancelRequestedAt
        AgentRunStatus status
        int executionAttempt
        string executionToken
        datetime leaseExpiresAt
        datetime heartbeatAt
        string runtime
        string model
        text output
        text reason
        string runtimeSessionId
        datetime createdAt
        datetime updatedAt
    }
    AgentConversation {
        string id PK
        string title
        string runtime
        json runtimeContinuationState
        datetime createdAt
        datetime updatedAt
    }
    AgentRunEvent {
        string id PK
        string runId FK
        int sequence
        int executionAttempt
        string kind
        json payload
        datetime createdAt
    }
    TemplateEvent {
        string id PK
        string type
        json payload
        datetime createdAt
    }
    AgentConversation ||--o{ AgentRun : runs
    AgentRun ||--o{ AgentRunEvent : events
```

- `TemplateEvent`：通用模板事件日志，用于 MCP 读取模型（如 `list-template-events`、`summarize-template-events-by-type`）。它的 `payload` 是 JSONB，事件类型由 `type` 字段标识。
- `AgentRun`：一次 Agent 执行的完整记录，包括提示词、状态机、执行租约（`executionToken`、`leaseExpiresAt`、`heartbeatAt`）和运行结果。
- `AgentRunEvent`：单个 Run 的事件流，每条记录按 `(runId, sequence)` 唯一，并记录重试次数 `executionAttempt`，用于区分同一 Run 多次 claim 产生的事件。
- `AgentConversation`：一个对话容器，持有运行时类型（`claude` 或 `eve`）以及可延续状态 `runtimeContinuationState`，其下可挂多个 Run。

Sources: [schema.prisma](packages/db/prisma/schema.prisma#L11-L89), [agent-run-repository.ts](packages/db/src/agent-run-repository.ts#L11-L13)

## AgentRun 状态机与执行租约

`AgentRun` 使用 PostgreSQL 原生枚举 `AgentRunStatus`，包含 `queued`、`running`、`waiting`、`completed`、`failed`、`skipped`、`cancelled` 七个状态。`waiting` 是后期追加的状态，用于等待用户输入或外部审批。`startedAt` 在首次 claim 时写入且之后保持不变，`completedAt` 在最终结束时写入。

执行租约通过 `executionToken` + `leaseExpiresAt` + `heartbeatAt` 实现。`claim` 用一段带条件的 `UPDATE` 原子地完成“抢占”：只有 `queued` 或已过期 `running` 的 Run 才能被领取，并同时把状态改为 `running`、增加 `executionAttempt`、写入运行者和模型。`heartbeat` 同理，必须校验当前 `executionToken` 且租约未过期。这种设计让 API 与 Worker 进程在共享数据库的前提下实现分布式锁，避免同一 Run 被多个 Worker 并发执行。

Sources: [schema.prisma](packages/db/prisma/schema.prisma#L22-L61), [agent-run-repository.ts](packages/db/src/agent-run-repository.ts#L111-L188), [add_agent_run_waiting_status.sql](packages/db/prisma/migrations/20260711170000_add_agent_run_waiting_status/migration.sql#L1-L2)

## AgentConversation 与运行时延续

`AgentConversation` 是 Run 的聚合上下文。每个 Conversation 绑定到单一运行时（`claude`/`eve`），并在 `finishExecution` 时把 `runtimeContinuation` 写回 `runtimeContinuationState`。`AgentRun` 通过 `conversationId` 外键与 Conversation 关联；当 Conversation 被删除时，Run 的 `conversationId` 会被设为 `NULL`，而不是级联删除 Run。

数据库层面通过 `AgentRun_one_active_per_conversation_idx` 部分唯一索引保证：一个 Conversation 同一时刻最多只能有一个 `queued` 或 `running` 的 Run。如果尝试在已有活跃 Run 的 Conversation 中创建新 Run，仓库会抛出 `AgentConversationBusyError`。

Sources: [schema.prisma](packages/db/prisma/schema.prisma#L63-L74), [agent-conversation-repository.ts](packages/db/src/agent-conversation-repository.ts#L1-L66), [add_agent_conversations.sql](packages/db/prisma/migrations/20260711110000_add_agent_conversations/migration.sql#L30-L34), [shared/agent-conversation.ts](packages/shared/src/agent-conversation.ts#L44-L52)

## AgentRunEvent 事件流与 Tool 调用关联

`AgentRunEvent` 把 Agent 运行时产生的事件序列化进 `payload` JSONB。`kind` 字段与 `payload.kind` 保持一致，包括 `tool-call`、`tool-result`、`text`、`done`、`error`、`cancelled`、`input-request`、`artifacts`、`unknown`。`sequence` 在同一 Run 内单调递增，并参与唯一约束 `(runId, sequence)`。

数据库层还为 `tool-result` 类型建立了表达式索引 `AgentRunEvent_toolResult_correlation_idx`，它提取 `payload->>'callId'` 并按 `runId`、`executionAttempt` 排序，使 MCP 工具能够高效地把 `tool-call` 与对应的 `tool-result` 关联起来，而不需要把 `callId` 提升为表列。

Sources: [schema.prisma](packages/db/prisma/schema.prisma#L76-L89), [agent-run-events.ts](packages/shared/src/agent-run-events.ts#L38-L63), [add_agent_run_tool_result_correlation_index.sql](packages/db/prisma/migrations/20260711103000_add_agent_run_tool_result_correlation_index/migration.sql#L1-L11)

## Fixture Schema（ecommerce_fixture）模型

`ecommerce_fixture` 是一个确定性的、用于语义层/MCP 测试的零售数据集，包含 96 位客户、24 件商品、600 张订单、1200 条订单明细和 540 条支付记录。模型关系如下：

```mermaid
erDiagram
    EcommerceCustomer {
        string id PK
        string customerCode UK
        EcommerceCustomerSegment segment
        string region
        string province
        string city
        datetime registeredAt
    }
    EcommerceProduct {
        string id PK
        string sku UK
        string name
        string category
        string brand
        decimal unitPrice
        boolean isActive
        datetime createdAt
    }
    EcommerceOrder {
        string id PK
        string orderNumber UK
        string customerId FK
        EcommerceSalesChannel channel
        EcommerceOrderStatus status
        datetime placedAt
        datetime paidAt
        datetime fulfilledAt
        decimal subtotal
        decimal discountTotal
        decimal shippingTotal
        decimal paidTotal
        decimal refundedTotal
        datetime createdAt
        datetime updatedAt
    }
    EcommerceOrderItem {
        string id PK
        string orderId FK
        string productId FK
        string sku
        string productName
        string category
        decimal unitPrice
        int quantity
        decimal discountTotal
        decimal lineTotal
    }
    EcommercePayment {
        string id PK
        string orderId FK
        EcommercePaymentMethod method
        EcommercePaymentStatus status
        decimal amount
        datetime paidAt
        datetime createdAt
    }
    EcommerceCustomer ||--o{ EcommerceOrder : places
    EcommerceOrder ||--|{ EcommerceOrderItem : contains
    EcommerceProduct ||--o{ EcommerceOrderItem : appears_in
    EcommerceOrder ||--|| EcommercePayment : has
```

- `EcommerceOrder` 同时记录订单状态、金额、支付与退款，退款总额通过数据库 CHECK 约束保证不超过 `paidTotal`。
- 所有时间戳均使用 `TIMESTAMPTZ(3)`，使跨时区查询不受会话 `TimeZone` 影响。
- 数据由 `createEcommerceFixture()` 生成函数以纯 JavaScript 计算得到，确保任何环境重建后数据完全一致。

Sources: [schema.prisma](packages/ecommerce-fixture/prisma/schema.prisma#L56-L144), [data.ts](packages/ecommerce-fixture/src/data.ts#L129-L257), [harden_ecommerce_time_and_refunds.sql](packages/db/prisma/migrations/20260710161434_harden_ecommerce_time_and_refunds/migration.sql#L29-L31)

## 索引与数据库约束策略

项目没有把所有约束都交给 Prisma Schema，而是把“业务不变量”留在数据库中，避免不同客户端（Prisma、Toolbox、MCP 原生查询）产生不一致行为。

| 约束/索引 | 所属表 | 作用 |
|---|---|---|
| `AgentRun_status_createdAt_idx` | `AgentRun` | 按状态+创建时间扫描队列 |
| `AgentRun_status_leaseExpiresAt_idx` | `AgentRun` | 查找过期租约，支持重试 |
| `AgentRun_conversationId_createdAt_idx` | `AgentRun` | 对话维度的 Run 列表 |
| `AgentRun_one_active_per_conversation_idx` | `AgentRun` | 一个 Conversation 只能有一个活跃 Run |
| `AgentRunEvent_runId_sequence_key` | `AgentRunEvent` | 保证事件序列唯一 |
| `AgentRunEvent_toolResult_correlation_idx` | `AgentRunEvent` | 加速 tool-call/tool-result 关联 |
| `EcommerceOrder_refundedTotal_range_check` | `EcommerceOrder` | 退款金额不超过实付金额 |
| `validate_toolbox_time_window` | 函数 | 校验时间窗口 `from < to` 且不超过 31 天 |

Prisma 原生不支持的表达式索引、部分索引和 CHECK 约束，被直接写入迁移 SQL；这与 `scripts/verify-toolbox-query-plans.ts` 等计划校验工具共同保证查询路径稳定。

Sources: [add_agent_run_lifecycle.sql](packages/db/prisma/migrations/20260711084500_add_agent_run_lifecycle/migration.sql#L43-L50), [add_agent_run_execution_lease.sql](packages/db/prisma/migrations/20260711084500_add_agent_run_lifecycle/migration.sql#L1-L14), [add_agent_conversations.sql](packages/db/prisma/migrations/20260711110000_add_agent_conversations/migration.sql#L24-L34), [add_agent_run_tool_result_correlation_index.sql](packages/db/prisma/migrations/20260711103000_add_agent_run_tool_result_correlation_index/migration.sql#L1-L11), [add_toolbox_time_window_guard.sql](packages/db/prisma/migrations/20260711083000_add_toolbox_time_window_guard/migration.sql#L4-L28), [harden_ecommerce_time_and_refunds.sql](packages/db/prisma/migrations/20260710161434_harden_ecommerce_time_and_refunds/migration.sql#L29-L31)

## Repository 模式与持久化边界

`@agent-template/db` 只导出两类持久化入口：

1. 全局 `prisma` 客户端（开发环境挂载到 `globalThis` 避免热重载产生多个连接）。
2. `createPrismaAgentRunRepository` 与 `createPrismaAgentConversationRepository` 工厂函数。

仓库内部把 Prisma 的枚举/日期类型转换为 `@agent-template/shared` 定义的领域类型（如 `AgentRunStatus`、`AgentRunSnapshot`）。`apps/api` 和 `apps/worker` 通过依赖注入把仓库挂到 `AgentRunLifecycle` 上，业务逻辑不直接依赖 Prisma Client。

```mermaid
flowchart LR
    API["apps/api"] -->|createPrismaAgentRunRepository| DB["@agent-template/db"]
    Worker["apps/worker"] -->|createPrismaAgentRunRepository| DB
    DB --> PrismaClient["Prisma Client<br/>(generated/client)"]
    PrismaClient --> Adapter["PrismaPg Adapter"]
    Adapter --> PG["PostgreSQL public"]
```

仓库中所有涉及并发状态转换的操作（`claim`、`heartbeat`、`appendExecutionEvent`、`finishExecution`）都使用 `$executeRaw` 手写 SQL，以便在 `WHERE` 子句里同时校验 `status`、`executionToken`、`leaseExpiresAt` 和 `cancelRequestedAt`。如果条件不满足，数据库不会返回 `updated === 1`，上层就知道“抢占失败”或“事件被丢弃”，而不是在应用层加锁。

Sources: [index.ts](packages/db/src/index.ts#L1-L21), [agent-run-repository.ts](packages/db/src/agent-run-repository.ts#L35-L156), [app.ts](apps/api/src/app.ts#L1-L56), [worker.ts](apps/worker/src/worker.ts#L1-L14), [lifecycle.ts](packages/agent/src/lifecycle.ts#L52-L102)

## 迁移与种子流程

平台迁移与 Fixture 迁移分开管理，但在根 `package.json` 中按依赖顺序编排：

| 命令 | 行为 |
|---|---|
| `pnpm db:generate` | 依次生成 `packages/db` 与 `packages/ecommerce-fixture` 的 Prisma Client |
| `pnpm db:migrate` | 先 `db` 的 `prisma migrate dev`，再 `ecommerce-fixture` 的 `db:migrate:dev` |
| `pnpm db:deploy` | 生产部署：先 `db` 的 `prisma migrate deploy`，再 Fixture 的 `db:migrate` |
| `pnpm db:seed` | 先 `db` 的种子，再 `ecommerce-fixture` 的种子 |

Fixture 包采用 Prisma Baseline 工作流：脚本 `scripts/migrate.ts` 会先检查 `ecommerce_fixture` 中是否已存在全部 5 张业务表。如果只有部分表（漂移状态），则拒绝打基线标记，防止把不完整的数据库标记为“已迁移”。这在 `verify-empty-database.ts --partial` 中被显式验证。

Sources: [package.json](package.json#L14-L17), [migrate.ts](packages/ecommerce-fixture/scripts/migrate.ts#L1-L95), [verify-empty-database.ts](packages/ecommerce-fixture/scripts/verify-empty-database.ts#L1-L56)

## 环境配置与连接字符串

平台与 Fixture 的默认连接字符串都指向同一数据库，但通过 `schema` 查询参数区分命名空间：

- `DATABASE_URL`：默认 `postgresql://project_template:project_template@localhost:15432/project_template?schema=public`
- `ECOMMERCE_FIXTURE_DATABASE_URL`：可覆盖，但 `getEcommerceFixtureDatabaseUrl` 会强制把 URL 的 `schema` 参数改写为 `ecommerce_fixture`

两个包都使用 `@prisma/adapter-pg` 的 Driver Adapter 模式，而不是让 Prisma 自己打开连接。`prisma.config.ts` 从 `../../.env` 和 `../../.env.local` 加载环境变量，为 CLI 命令提供统一的配置入口。

Sources: [.env.example](.env.example#L3-L4), [config.ts](packages/db/src/config.ts#L1-L7), [config.ts](packages/ecommerce-fixture/src/config.ts#L1-L15), [prisma.config.ts](packages/db/prisma.config.ts#L1-L18), [prisma.config.ts](packages/ecommerce-fixture/prisma.config.ts#L1-L18)

## 验证与质量门禁

项目通过三个根命令固化数据库边界的正确性：

1. `pnpm db:verify:boundaries`：执行 `scripts/verify-database-boundaries.ts`，从 `information_schema.tables` 读取 `public` 和 `ecommerce_fixture` 的表名，确认 `public` 中只包含平台表，且 `ecommerce_fixture` 中只包含 Fixture 表，并校验 Fixture 数据量与预期一致（96 客户、24 商品、600 订单、1200 明细、540 支付）。
2. `pnpm db:verify:fixture:empty`：在临时数据库中重建空库，验证 Fixture 能独立迁移并种子化。
3. `pnpm db:verify:migrations:empty`：在空库中同时部署平台与 Fixture 迁移并种子，验证两条历史能在同一数据库中顺序重建。
4. `pnpm db:verify:fixture:partial`：模拟 Fixture 只有部分表的漂移场景，验证基线拒绝逻辑。

这些脚本共同保证：即便未来迁移历史变化，平台数据与 Fixture 数据也不会互相泄漏。

Sources: [package.json](package.json#L21-L24), [verify-database-boundaries.ts](scripts/verify-database-boundaries.ts#L1-L82), [verify-empty-database.ts](packages/ecommerce-fixture/scripts/verify-empty-database.ts#L1-L148)

## 下一步阅读

- 若希望理解 Agent Run 的完整生命周期与执行租约如何在业务层调度，请继续阅读 [Agent Run 生命周期与执行租约](8-agent-run-sheng-ming-zhou-qi-yu-zhi-xing-zu-yue)。
- 若需要了解这些持久化模型如何被 API、SSE 和任务队列消费，请阅读 [API 路由、SSE 与任务队列](13-api-lu-you-sse-yu-ren-wu-dui-lie)。
- 若需要理解 Fixture 数据如何被 Toolbox 与 MCP 工具使用，请阅读 [Toolbox 与 MCP 工具供给](11-toolbox-yu-mcp-gong-ju-gong-gei)。
- 若需要从零开始搭建本地数据库并运行迁移，请参考 [快速启动](2-kuai-su-qi-dong)。