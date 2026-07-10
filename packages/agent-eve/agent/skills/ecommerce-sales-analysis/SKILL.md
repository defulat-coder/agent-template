---
name: ecommerce-sales-analysis
description: Analyzes ecommerce revenue, refunds, net sales, buyers, and channel performance. Use when the user asks about sales trends, GMV, refunds, net sales, or channel comparison.
---

## Usage

本项目已经把下列 Toolbox 能力注册为 Host-managed typed tools。加载本 skill 后，直接调用同名 Tool；不要绕过 MCP Host 直连数据库。官方生成器同时产出的直连脚本不会安装到 Agent 的 skill 目录。

## Workflow

1. 要求或确认不超过 31 天的 UTC `[from, to)` 时间窗。
2. 先调用 `summarize_ecommerce_sales_by_day` 判断趋势和异常日期。
3. 需要渠道归因时，再调用 `summarize_ecommerce_sales_by_channel`。
4. 明确区分 `grossSales`、`refundAmount` 与 `netSales`，不要把退款前销售额描述成实际收入。

## Available Toolbox tools

### summarize_ecommerce_sales_by_channel

Compare synthetic ecommerce sales performance across web, mini program, marketplace, and live stream channels.
Use this read-only tool for bounded channel-performance analysis.

#### Parameters

| Name | Type   | Description                                | Required | Default |
| :--- | :----- | :----------------------------------------- | :------- | :------ |
| from | string | Inclusive ISO-8601 UTC sales window start. | Yes      |         |
| to   | string | Exclusive ISO-8601 UTC sales window end.   | Yes      |         |

---

### summarize_ecommerce_sales_by_day

Summarize synthetic ecommerce gross sales, refunds, net sales, orders, and buyers by day.
Use this read-only tool for bounded sales-trend analysis in an ISO-8601 UTC time window.

#### Parameters

| Name | Type   | Description                                | Required | Default |
| :--- | :----- | :----------------------------------------- | :------- | :------ |
| from | string | Inclusive ISO-8601 UTC sales window start. | Yes      |         |
| to   | string | Exclusive ISO-8601 UTC sales window end.   | Yes      |         |

---
