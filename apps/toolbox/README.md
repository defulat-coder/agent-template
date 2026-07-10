# MCP Toolbox 生产级 SQL 示例

这里使用 Google 的 [MCP Toolbox for Databases](https://mcp-toolbox.dev/) 为 `TemplateEvent` 提供生产 Agent 可调用的只读 PostgreSQL 工具。配置入口是 [tools.yaml](./tools.yaml)，服务由根目录的 `docker-compose.yml` 以固定版本 `1.6.0` 运行。

## 设计边界

- 不暴露 `postgres-execute-sql` 或任何通用 SQL tool；每个 `postgres-sql` 都是预定义 statement，并由 Toolbox 以 prepared statement 执行。
- 所有列表工具都有上限；最近查询固定在 30 天，任意时间窗由运行时校验为 ISO-8601 UTC 的 `[from, to)`，最长 31 天。
- 所有工具只读；`TemplateEvent` payload 会原样返回的工具仅用于可信的内部运营 Agent，生产接入时仍需最小权限数据库角色。
- 不使用 `templateParameters`，避免让模型控制表名、列名、排序字段或 SQL 结构。
- `mcp-host.config.json` 的 `allowedTools` 是 Host 侧可执行 allowlist。Google Toolbox 的 toolset 由其 Client SDK 选择；裸 MCP `tools/list` 默认可见服务端全部工具，因此新增 Tool 时必须同时更新 allowlist。

## 已提供的查询

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

## 可执行示例

先启动本地 PostgreSQL 和 Toolbox，并准备确定性示例数据：

```bash
docker compose up -d postgres toolbox
pnpm db:migrate
pnpm db:seed
```

查询一个时间窗中的失败 run：

```bash
docker compose exec toolbox toolbox --config /app/tools.yaml invoke list-failed-agent-runs-in-window '{"from":"2026-07-04T00:00:00Z","to":"2026-07-05T00:00:00Z","limit":50}'
```

汇总 MCP Tool 调用量和 P95 延迟：

```bash
docker compose exec toolbox toolbox --config /app/tools.yaml invoke summarize-tool-invocations '{"from":"2026-07-04T00:00:00Z","to":"2026-07-05T00:00:00Z","limit":20}'
```

获取一个已知 run 的摘要和有界时间线：

```bash
docker compose exec toolbox toolbox --config /app/tools.yaml invoke get-agent-run-summary '{"runId":"run_invoice_001"}'
docker compose exec toolbox toolbox --config /app/tools.yaml invoke list-agent-run-timeline '{"runId":"run_invoice_001","limit":100}'
```

`terminalEvent` 始终取该 run 最后一个 `agent.run.completed` 或 `agent.run.failed` 事件；因此“失败后重试成功”会正确显示为 completed，而失败事件查询仍保留原始故障证据。

## 索引与上线要求

`TemplateEvent` 的常用观察路径由 `createdAt`、`(type, createdAt)` 和 `(payload->>'runId', createdAt)` 索引支持；最后一个是 Prisma schema 目前无法表达的 PostgreSQL expression index，因此保留在已提交 migration 中。

实际多租户项目不得直接复用当前模板的跨组织查询。应先将稳定的 `tenantId` / `organizationId` 提升为一等列，使用受限数据库角色和 RLS，再为每个 Tool 强制注入可信身份范围；不要把租户范围交给模型提供的 `templateParameters`。

修改工具后，依次运行：

```bash
docker compose config
docker compose up -d --force-recreate toolbox
pnpm --filter @agent-template/shared test
pnpm --filter @agent-template/agent-claude test
pnpm --filter @agent-template/agent-eve test
```
