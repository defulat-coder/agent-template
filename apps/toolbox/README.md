# MCP Toolbox 生产级 SQL 示例

这里使用 Google 的 [MCP Toolbox for Databases](https://mcp-toolbox.dev/) 为 `TemplateEvent` 和合成电商读模型提供生产 Agent 可调用的只读 PostgreSQL 工具。配置入口是 [tools.yaml](./tools.yaml)，默认验证直接启动项目锁定的官方 `1.6.0` 本机二进制；`docker-compose.yml` 只保留为显式容器模式。

[tools.yaml](./tools.yaml) 是 Tool、Toolset 与 MCP annotations 的可执行事实源，[SEMANTIC_LAYER.md](./SEMANTIC_LAYER.md) 记录人类可读的业务指标、时间口径和命名兼容策略。当前 PostgreSQL 项目实现的是 Google Toolbox 的工具语义契约，不是 AlloyDB AI NL 或 Looker 专属语义层。

智能问数的术语、指标、实际字段/取值、歧义处理和 golden cases 位于 [semantic/](./semantic/)，完整的生产落地路径见 [INTELLIGENT_QUERY.md](./INTELLIGENT_QUERY.md)。

真实业务数据必须使用 [Toolbox 生产认证](./PRODUCTION_AUTH.md)：生成的 OIDC 配置在 `generated/toolbox-production/tools.yaml`，Claude/Eve runtime 从部署环境的 `TOOLBOX_AUTH_TOKEN` 设置 Bearer token。开发 fixture 配置不启用认证，不能直接作为生产部署配置。

生产日志、SQLCommenter、OpenTelemetry 与告警要求见 [Toolbox 生产可观测性](./OBSERVABILITY.md)。

## 设计边界

- 不暴露 `postgres-execute-sql` 或任何通用 SQL tool；每个 `postgres-sql` 都是预定义 statement，并由 Toolbox 以 prepared statement 执行。
- 所有列表工具都有上限；最近查询固定在 30 天，任意时间窗由 PostgreSQL `validate_toolbox_time_window` 强制为 ISO-8601 UTC 的 `[from, to)`，最长 31 天。该 invariant 不依赖 Agent 是否遵守描述。
- 所有工具只读；`TemplateEvent` payload 会原样返回的工具仅用于可信的内部运营 Agent，生产接入时仍需最小权限数据库角色。
- 不使用 `templateParameters`，避免让模型控制表名、列名、排序字段或 SQL 结构。
- 所有 SQL Tool 显式标注 `readOnlyHint: true`、`destructiveHint: false`、`idempotentHint: true` 和 `openWorldHint: false`。
- 面向 Agent 的业务 Toolset 按单一分析或运营任务分组，避免一次向模型暴露无关 Tool 导致 context rot。
- 裸 MCP `tools/list` 默认可见服务端全部工具；`AGENT_CAPABILITY_PROFILE` 从 `@agent-template/toolbox-config` 选择 Agent 模型可见的业务子集。无认证的本地开发默认 `development-all`；配置 `TOOLBOX_AUTH_TOKEN` 后必须显式使用 `ecommerce-sales`、`ecommerce-product`、`ecommerce-orders`、`ecommerce-fulfillment`、`ecommerce-analyst` 或 `platform-observability`，不能继续使用 `development-all`。
- Capability Profile 是模型工具面约束，不代替授权。生产强制边界是 Toolbox OIDC、Tool scope、受限数据库角色与 RLS/等效控制。

## 电商业务验证数据（主要路径）

`pnpm db:seed` 会写入完全确定性的合成零售数据：96 个脱敏客户、24 个商品、600 个订单、1,200 个订单项和 540 条支付记录。订单覆盖过去 60 天，并包含 Web、小程序、平台和直播四种渠道，以及已支付、已履约、全额退款、部分退款、取消和待支付状态。所有电商业务时间存为 `timestamptz`，窗口统一按 UTC 解释；它是生产形态的测试数据，不是任何真实客户或交易数据。

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

## 电商业务 Agent Skills

Toolbox 官方的 `skills-generate` 会把自定义 Toolset 转换为 Agent Skill。项目在此基础上生成四个按业务任务拆分的 Skill，并同时接入 Eve 和 Claude Agent：

| Skill                              | Toolbox Toolset                    | 业务用途                 |
| ---------------------------------- | ---------------------------------- | ------------------------ |
| `ecommerce-sales-analysis`         | `ecommerce-sales-analytics`        | 销售趋势、退款、渠道分析 |
| `ecommerce-product-analysis`       | `ecommerce-product-analytics`      | 商品排行与选品分析       |
| `ecommerce-order-operations`       | `ecommerce-order-operations`       | 订单查询与单据排障       |
| `ecommerce-fulfillment-operations` | `ecommerce-fulfillment-operations` | 履约积压与异常订单       |

本地重新生成：

```bash
pnpm skills:generate:toolbox
```

生成器使用锁定的 `@toolbox-sdk/server` 读取 [tools.yaml](./tools.yaml)，产物分为三层：

```text
generated/toolbox-skills/        # Toolbox 官方原始完整产物
.claude/skills/                  # Claude 实际加载的适配版
packages/agent-eve/agent/skills/ # Eve 实际加载的适配版
```

原始目录保留每个 Skill 的 `SKILL.md`、`assets/tools.yaml` 和 `scripts/*.js`，便于检查和本地诊断。Eve Skill 调用 `toolbox__*`，Claude Skill 调用 `mcp__toolbox__*`。实际版 Skill 除了按需加载业务流程，还带有 `references/ecommerce-semantic-catalog.yaml`；执行由各 runtime 的原生 MCP Client 完成，官方数据库直连脚本不会复制进 Agent 运行目录。

Toolbox 固定生成的标题、表头和脚本模板保持英文；可配置的 Skill 描述、补充说明、业务 Tool 描述和参数描述统一使用中文。生成门禁会检查这些业务内容包含中文。

这四个业务 Toolset 用于官方 Skill 生成和业务能力分组，不是运行时授权机制。Agent 模型可见范围由 `AGENT_CAPABILITY_PROFILE` 收窄：Claude 使用 SDK `allowedTools` 与 MCP Tool policy，Eve connection 使用 `tools.allow`，两者读取同一份共享配置。

## 电商 MCP 本地端到端验证（默认）

本机 PostgreSQL 监听 `15432` 后执行：

```bash
pnpm toolbox:verify:local
```

该命令直接使用 `.env`/默认本地连接，对本机数据库执行 migration 和确定性 seed，启动临时官方 Toolbox 二进制，然后用原生 MCP Client 验证 `tools/list`、10 个业务场景、分页、空结果、部分退款、UTC 边界、非法时间窗与能力 Profile。命令结束后临时 Toolbox 自动退出，不使用 Docker。

## 电商 MCP Docker 集成验证（仅显式要求时）

```bash
pnpm toolbox:verify:docker
```

该门禁会启动 PostgreSQL 与 Toolbox、生成 Prisma Client、应用已提交 migration、写入 fixture、重建 Toolbox，然后精确断言裸 MCP `tools/list` 和电商 Tool 的确定性返回值。

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

## Agent 运行观测示例（兼容）

| Tool                                | 适用场景                   | 保护措施                                |
| ----------------------------------- | -------------------------- | --------------------------------------- |
| `list-template-events`              | 最近 30 天事件巡检         | 结果最大 100 行                         |
| `get-template-event`                | 按事件 ID 定位             | 精确主键查询                            |
| `list-template-events-in-window`    | 限定时间窗的事件排障       | `[from, to)` + 最大 100 行              |
| `summarize-template-events-by-type` | 事件量与 run 覆盖度概览    | 时间窗聚合，不返回 payload              |
| `list-agent-runs`                   | 最近 30 天 run 面板        | 结果最大 100 行                         |
| `get-agent-run-summary`             | 某个 run 的生命周期摘要    | 精确 `runId` 查询                       |
| `list-agent-run-timeline`           | 某个 run 的有界时间线      | 精确 `runId` + 最大 200 行              |
| `list-failed-agent-runs-in-window`  | 故障分诊                   | 固定失败事件类型 + 时间窗 + 最大 100 行 |
| `summarize-tool-invocations`        | MCP Tool 使用量与 P95 延迟 | 固定调用事件类型 + 时间窗 + 最大 100 组 |

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

`terminalEvent` 始终取该 run 最后一个 `agent.run.completed` 或 `agent.run.failed` 事件；因此“失败后重试成功”会正确显示为 completed，而失败事件查询仍保留原始故障证据。

## 索引与上线要求

`TemplateEvent` 的常用观察路径由 `createdAt`、`(type, createdAt)` 和 `(payload->>'runId', createdAt)` 索引支持；最后一个是 Prisma schema 目前无法表达的 PostgreSQL expression index，因此保留在已提交 migration 中。电商读模型为订单时间、状态/付款时间、客户/付款时间、订单项外键建索引；已结算订单另有部分覆盖索引，避免把取消和待支付订单放入日销售、渠道和商品排行的访问路径。商品净销售会把订单级退款按 `refundedTotal / paidTotal` 比例分摊到订单项，保证全额与部分退款和日销售、渠道销售的净额口径一致。

实际多租户项目不得直接复用当前模板的跨组织查询。应先将稳定的 `tenantId` / `organizationId` 提升为一等列，使用受限数据库角色和 RLS，再为每个 Tool 强制注入可信身份范围；不要把租户范围交给模型提供的 `templateParameters`。

修改工具或 Skill 后，默认先执行纯本地验证：

```bash
pnpm toolbox:check
pnpm --filter @agent-template/shared test
pnpm --filter @agent-template/agent-claude test
pnpm --filter @agent-template/agent-eve test
pnpm --filter @agent-template/agent-eve eve:info
```

只有明确要求容器集成验证时，才运行前述 Docker 门禁。
