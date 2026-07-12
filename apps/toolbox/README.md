# MCP Toolbox 跨域业务能力示例

这里使用 Google 的 [MCP Toolbox for Databases](https://mcp-toolbox.dev/) 为真实 `AgentRun` record、`TemplateEvent` 样例事件和跨域合成零售读模型提供生产 Agent 可调用的只读 PostgreSQL 工具。配置入口是 [tools.yaml](./tools.yaml)，默认验证直接启动项目锁定的官方 `1.6.0` 本机二进制；`docker-compose.yml` 只保留为显式容器模式。

[tools.yaml](./tools.yaml) 是底层 Tool、Toolset 与 MCP annotations 的可执行事实源，[SEMANTIC_LAYER.md](./SEMANTIC_LAYER.md) 记录可执行的业务指标、时间口径和命名兼容策略。当前 PostgreSQL 项目实现的是 runtime-local 语义解析器加认证 Toolbox 查询，不是 AlloyDB AI NL 或 Looker 专属语义层。

智能问数的术语、指标、实际字段/取值、歧义处理和 golden cases 位于 [semantic/](./semantic/)，完整的生产落地路径见 [INTELLIGENT_QUERY.md](./INTELLIGENT_QUERY.md)。

真实业务数据必须使用 [Toolbox 生产认证](./PRODUCTION_AUTH.md)：生成的 OIDC 配置在 `generated/toolbox-production/tools.yaml`，Claude/Eve runtime 从部署环境的 `TOOLBOX_AUTH_TOKEN` 设置 Bearer token。开发 fixture 配置不启用认证，不能直接作为生产部署配置。

生产日志、SQLCommenter、OpenTelemetry 与告警要求见 [Toolbox 生产可观测性](./OBSERVABILITY.md)。

## 设计边界

- 不暴露 `postgres-execute-sql` 或任何通用 SQL tool；每个 `postgres-sql` 都是预定义 statement，并由 Toolbox 以 prepared statement 执行。
- 所有列表工具都有上限；最近查询固定在 30 天，任意时间窗由 PostgreSQL `validate_toolbox_time_window` 强制为 ISO-8601 UTC 的 `[from, to)`，最长 31 天。该 invariant 不依赖 Agent 是否遵守描述。
- 所有工具只读；`TemplateEvent` payload 会原样返回的工具仅用于可信的内部运营 Agent，生产接入时仍需最小权限数据库角色。
- 不使用 `templateParameters`，避免让模型控制表名、列名、排序字段或 SQL 结构。
- 所有 SQL Tool 显式标注 `readOnlyHint: true`、`destructiveHint: false`、`idempotentHint: true` 和 `openWorldHint: false`。
- 面向 Agent 的业务 Toolset 按单一分析或运营任务分组；runtime 可执行这些认证 Tool，但模型只通过 `query_business_data` 间接调用，避免绕过语义目录。
- 裸 MCP `tools/list` 默认可见服务端全部工具；`AGENT_CAPABILITY_PROFILE` 从 `@agent-template/toolbox-config` 选择完整 Capability Pack，并分别展开 runtime 可执行 Tool、模型可直连 Tool、Skill 与语义目录。无认证的本地开发默认 `development-all`；配置 `TOOLBOX_AUTH_TOKEN` 后必须显式使用岗位级业务角色或 `platform-observability`，不能使用聚合的 `development-all` / `business-operations`。
- Capability Profile 是模型工具面约束，不代替授权。生产强制边界是 Toolbox OIDC、Tool scope、受限数据库角色与 RLS/等效控制。

## 跨域合成业务数据（主要路径）

`pnpm db:seed` 会通过 `packages/ecommerce-fixture` 向独立 PostgreSQL `ecommerce_fixture` schema 写入 15,214 条完全确定性的合成零售运营记录。既有 96 个客户、24 个商品、600 个订单、1,200 个订单项和 540 条支付之外，还包括 133 条退款、480 张发票、240 个渠道日结算、6 个仓库、8,640 条库存日快照、12 个供应商、180 张采购单、480 个运单、1,883 条轨迹、12 个活动和 688 条多触点归因。订单主线连接全部领域；固定场景包含退款生命周期、待结算、部分退款、结算差异、发票异常、承运商延迟/丢件、缺货、采购延期/取消、多渠道触点和低效活动。所有业务时间存为 `timestamptz`，窗口统一按 UTC 解释。物理 schema 名只为迁移兼容；这里没有任何真实客户、供应商、支付或物流数据。

| Tool                                    | 验证场景                 | 保护措施                                |
| --------------------------------------- | ------------------------ | --------------------------------------- |
| `summarize-ecommerce-sales-by-day`      | 日 GMV、退款、净销售趋势 | `[from, to)` 聚合                       |
| `summarize-ecommerce-sales-by-channel`  | 多渠道经营对比           | `[from, to)` 聚合                       |
| `summarize_sales_by_region`             | 大区销售、退款与客单价   | `[from, to)` 聚合；仅返回聚合结果       |
| `summarize_sales_by_customer_segment`   | 新客、活跃、VIP 分群分析 | `[from, to)` 聚合；枚举值受语义目录约束 |
| `list-ecommerce-top-products`           | 商品销量与净销售排行     | 时间窗 + `limit/offset`；按退款比例分摊 |
| `summarize_merchandise_by_category`     | 品类销量与净商品销售额   | `[from, to)` 聚合；不包含运费           |
| `list-ecommerce-orders-in-window`       | 订单运营视图             | 时间窗 + `limit/offset`；无联系方式     |
| `get-ecommerce-order-detail`            | 单订单与订单项核查       | 精确订单号                              |
| `list-ecommerce-fulfillment-exceptions` | 已付款未履约订单         | 时间窗 + `limit/offset`                 |

新增业务 Pack 不把表级 CRUD 暴露给 Agent，而是提供以下结果级能力：

| Capability Pack           | Tool 数 | 代表性结果                                           |
| ------------------------- | ------: | ---------------------------------------------------- |
| `finance-analysis`        |       5 | 财务总览、支付方式、退款原因、发票异常、渠道结算对账 |
| `logistics-operations`    |       5 | 承运商表现、物流异常、运单轨迹、SLA、运费            |
| `supply-chain-operations` |       6 | 库存健康、缺货风险、仓库库存、采购与供应商表现       |
| `marketing-analysis`      |       5 | 活动表现、渠道投入、优惠效率、低效活动与获客         |

## Capability Pack 与 Agent Skills

Toolbox 官方的 `skills-generate` 会把自定义 Toolset 转换为 Agent Skill。项目把 Toolset、scope、语义目录和 Skill 定义收拢为 Capability Pack，并同时编译到 Eve 和 Claude Agent：

| Skill                              | Toolbox Toolset                    | 业务用途                 |
| ---------------------------------- | ---------------------------------- | ------------------------ |
| `ecommerce-sales-analysis`         | `ecommerce-sales-analytics`        | 销售趋势、退款、渠道分析 |
| `ecommerce-product-analysis`       | `ecommerce-product-analytics`      | 商品排行与选品分析       |
| `ecommerce-order-operations`       | `ecommerce-order-operations`       | 订单查询与单据排障       |
| `ecommerce-fulfillment-operations` | `ecommerce-fulfillment-operations` | 履约积压与异常订单       |
| `finance-analysis`                 | `finance-analysis`                 | 支付、退款、发票与结算   |
| `logistics-operations`             | `logistics-operations`             | 运单、SLA、异常与运费    |
| `supply-chain-operations`          | `supply-chain-operations`          | 库存、缺货、采购与供应商 |
| `marketing-analysis`               | `marketing-analysis`               | 活动、渠道、优惠与获客   |

本地重新生成：

```bash
pnpm skills:generate:toolbox
```

生成器使用锁定的 `@toolbox-sdk/server` 读取 [tools.yaml](./tools.yaml)，产物分为三层：

```text
generated/toolbox-skills/             # Toolbox 官方原始完整产物
packages/toolbox-config/src/business-semantic-catalogs.generated.ts # runtime 类型化目录
packages/agent-claude/.claude/skills/ # Claude 实际加载的适配版
packages/agent-claude/.claude/skills-manifest.json # Profile/Pack/Skill/Tool 编译清单
packages/agent-eve/agent/skills/ # Eve 实际加载的适配版
```

原始目录保留每个 Skill 的 `SKILL.md`、`assets/tools.yaml` 和 `scripts/*.js`，便于检查和本地诊断。适配后的 Eve Skill 调用 `query_business_data`，Claude Skill 调用 `mcp__semantic_query__query_business_data`。实际版 Skill 除了按需加载业务流程，还带有该 Pack 的 `references/<catalog>.yaml`；底层认证 Tool 由各 runtime 自己的 MCP Client 执行，官方数据库直连脚本不会复制进 Agent 运行目录。

Toolbox 固定生成的标题、表头和脚本模板保持英文；可配置的 Skill 描述、补充说明、业务 Tool 描述和参数描述统一使用中文。生成门禁会检查这些业务内容包含中文。

Capability Pack 用于官方 Skill 生成、语义治理和模型能力分组，不是运行时授权机制。`AGENT_CAPABILITY_PROFILE` 只组合完整 Pack；共享编译结果同时提供 `semanticExecutionTools`、`modelSurface.visibleTools/hiddenTools`、`semanticCatalogs`、`enabledSkills` 与 `scopes`。Claude 与 Eve 只把平台观测 Tool 直接交给模型；业务问数统一经过 runtime-local 语义 Tool。

## 业务 MCP 本地端到端验证（默认）

本机 PostgreSQL 监听 `15432` 后执行：

```bash
pnpm toolbox:verify:local
```

该命令直接使用 `.env`/默认本地连接，对本机数据库执行 migration 和确定性 seed，写入临时真实 Agent run record，启动官方 Toolbox 二进制，然后用固定 candidate 串起 semantic plan、原生 MCP Tool 和结果 envelope，并验证 `tools/list`、跨域代表场景、澄清、能力拒绝、Agent run 观测、分页、空结果、异常数据、UTC 边界与非法时间窗。临时 run 与 Toolbox 进程在结束时自动清理，不使用 Docker。

`pnpm db:verify:boundaries` 可单独验证平台表只在 `public`，合成业务表只在 `ecommerce_fixture`。

## 显式容器诊断（仅用户要求时）

以下命令只用于明确选择 Docker 的诊断场景，不属于默认验证路径。

## 业务 MCP Docker 集成验证（仅显式要求时）

```bash
pnpm toolbox:verify:docker
```

该门禁会启动 PostgreSQL 与 Toolbox、生成 Prisma Client、应用已提交 migration、写入 fixture、重建 Toolbox，然后精确断言裸 MCP `tools/list` 和跨域代表 Tool 的确定性返回值。

容器内 Toolbox 监听 `0.0.0.0:15000` 供 Compose 网络中的 API、Worker 和 Eve 使用；宿主机端口只绑定 `127.0.0.1:15000`。开发配置不启用 OIDC，禁止改回所有网卡暴露。

验证日销售、渠道和商品排行：

```bash
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke summarize-ecommerce-sales-by-day '{"from":"2026-06-01T00:00:00Z","to":"2026-07-01T00:00:00Z"}'
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke summarize-ecommerce-sales-by-channel '{"from":"2026-06-01T00:00:00Z","to":"2026-07-01T00:00:00Z"}'
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke list-ecommerce-top-products '{"from":"2026-06-01T00:00:00Z","to":"2026-07-01T00:00:00Z","limit":10}'
```

验证订单明细与履约异常：

```bash
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke get-ecommerce-order-detail '{"orderNumber":"EC20260601001"}'
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke list-ecommerce-fulfillment-exceptions '{"from":"2026-06-01T00:00:00Z","to":"2026-07-01T00:00:00Z","limit":20}'
```

## Agent 运行观测示例

| Tool                                | 适用场景                   | 保护措施                            |
| ----------------------------------- | -------------------------- | ----------------------------------- |
| `list-template-events`              | 最近 30 天事件巡检         | 结果最大 100 行                     |
| `get-template-event`                | 按事件 ID 定位             | 精确主键查询                        |
| `list-template-events-in-window`    | 限定时间窗的事件排障       | `[from, to)` + 最大 100 行          |
| `summarize-template-events-by-type` | 事件量与 run 覆盖度概览    | 时间窗聚合，不返回 payload          |
| `list-agent-runs`                   | 最近 30 天 run 面板        | 结果最大 100 行                     |
| `get-agent-run-summary`             | 某个 run 的生命周期摘要    | 精确 `runId` 查询                   |
| `list-agent-run-timeline`           | 某个 run 的有界时间线      | 精确 `runId` + 最大 200 行          |
| `list-failed-agent-runs-in-window`  | 故障分诊                   | 固定失败状态 + 时间窗 + 最大 100 行 |
| `summarize-tool-invocations`        | MCP Tool 使用量与 P95 延迟 | 配对 callId + 时间窗 + 最大 100 组  |

## Agent 工具示例

默认使用本地验收命令准备数据并执行全部示例：

```bash
pnpm toolbox:verify:local
```

下列 `docker compose exec` 只作为用户明确要求容器诊断时的手工调用示例，不属于默认验证流程。

查询一个时间窗中的失败 run：

```bash
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke list-failed-agent-runs-in-window '{"from":"2026-07-04T00:00:00Z","to":"2026-07-05T00:00:00Z","limit":50}'
```

汇总 MCP Tool 调用量和 P95 延迟：

```bash
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke summarize-tool-invocations '{"from":"2026-07-04T00:00:00Z","to":"2026-07-05T00:00:00Z","limit":20}'
```

获取一个已知 run 的摘要和有界时间线：

```bash
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke get-agent-run-summary '{"runId":"run_invoice_001"}'
docker compose exec toolbox /toolbox --config /app/tools.yaml invoke list-agent-run-timeline '{"runId":"run_invoice_001","limit":100}'
```

Agent run 相关 Tool 直接读取 `public."AgentRun"` 与 `public."AgentRunEvent"`。时间线显式返回 `executionAttempt`，Tool call/result 按 `runId + executionAttempt + callId` 配对，避免 retry 复用 callId 时串联不同 attempt。`TemplateEvent` 只保留样例事件巡检职责，不再作为 run 生命周期、终态或 Tool 调用统计的间接投影。

## 索引与上线要求

`TemplateEvent` 的样例巡检路径由 `createdAt` 与 `(type, createdAt)` 索引支持；Agent run 列表先用 `(requestedAt DESC, id DESC)` 限量再按 run 统计事件，失败窗口使用 partial `(completedAt DESC, id DESC) WHERE status='failed'`，Tool invocation 使用 `(kind, createdAt)`，时间线使用唯一 `(runId, sequence)`。`pnpm toolbox:verify:plans` 通过真实 PostgreSQL `EXPLAIN` 锁定这些访问路径。电商读模型为订单时间、状态/付款时间、客户/付款时间、订单项外键建索引；已结算订单另有部分覆盖索引，避免把取消和待支付订单放入日销售、渠道和商品排行的访问路径。商品净销售会把订单级退款按 `refundedTotal / paidTotal` 比例分摊到订单项，保证全额与部分退款和日销售、渠道销售的净额口径一致。

实际多租户项目不得直接复用当前模板的跨组织查询。应先将稳定的 `tenantId` / `organizationId` 提升为一等列，使用受限数据库角色和 RLS，再为每个 Tool 强制注入可信身份范围；不要把租户范围交给模型提供的 `templateParameters`。

修改工具或 Skill 后，默认先执行纯本地验证：

```bash
pnpm toolbox:check
pnpm db:verify:boundaries
pnpm --filter @agent-template/shared test
pnpm --filter @agent-template/agent-claude test
pnpm --filter @agent-template/agent-eve test
pnpm --filter @agent-template/agent-eve eve:info
```

只有明确要求容器集成验证时，才运行前述 Docker 门禁。
