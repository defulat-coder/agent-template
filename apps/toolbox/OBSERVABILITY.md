# Toolbox 生产可观测性

本项目的本地 Toolbox 启动器默认使用 JSON 日志、SQLCommenter 和稳定的 OpenTelemetry service name。生产部署使用相同参数，并通过 `TOOLBOX_OTLP_ENDPOINT` 接入现有 OTel Collector；不在 Tool 参数、日志字段或 trace attributes 中记录 JWT、数据库密码或 PII。

## 本地默认值

```dotenv
TOOLBOX_LOG_LEVEL=INFO
TOOLBOX_SQL_COMMENTER=true
TOOLBOX_OTLP_ENDPOINT=
TOOLBOX_TELEMETRY_SERVICE_NAME=agent-template-toolbox
```

`pnpm toolbox:verify:local` 和 `pnpm toolbox:verify:auth:local` 都通过同一个临时进程启动器读取这些值。OTLP endpoint 为空时只输出 JSON 日志；配置 endpoint 后会增加 `--telemetry-otlp`，无需改代码。

## 生产启动参数

```bash
node_modules/.bin/toolbox \
  --config generated/toolbox-production/tools.yaml \
  --toolbox-url "$TOOLBOX_URL" \
  --address 0.0.0.0 \
  --port 15000 \
  --logging-format JSON \
  --log-level "$TOOLBOX_LOG_LEVEL" \
  --sql-commenter \
  --telemetry-otlp "$TOOLBOX_OTLP_ENDPOINT" \
  --telemetry-service-name "$TOOLBOX_TELEMETRY_SERVICE_NAME"
```

未部署 OTel Collector 时移除 `--telemetry-otlp`，不要传空参数。

## 必看信号

- MCP 请求量、错误率和 P50/P95/P99 延迟，按 server、Tool、状态分类。
- 数据库查询耗时、连接池等待、超时与取消；SQLCommenter 用于将数据库侧查询关联回 Toolbox 调用。
- Agent runtime 中的 Tool 名、语义目录版本、返回行数、空结果与分页信息；不要记录完整业务明细。
- 认证失败、scope 拒绝和 capability profile 拒绝；token 只能记录不可逆摘要或 issuer/subject 的非敏感标识。
- 空结果率、澄清率、未知术语和用户纠正，作为语义目录治理输入。

告警至少覆盖进程不可用、认证失败突增、Tool 错误率、P95 延迟和数据库连接耗尽。业务指标结果本身由数据质量与对账任务监控，不用 MCP 可用性指标代替。

## 官方参考

- [Toolbox telemetry](https://mcp-toolbox.dev/documentation/monitoring/telemetry/)
- [Toolbox production deployment](https://mcp-toolbox.dev/how-to/deploy_toolbox/)
