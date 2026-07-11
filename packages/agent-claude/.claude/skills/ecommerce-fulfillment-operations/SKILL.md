---
name: ecommerce-fulfillment-operations
description: 查找已付款但未履约的电商订单并支持履约异常排查。用户询问履约积压、等待时长、延迟订单或运营异常时使用。
---

## Usage

本项目的 Claude 与 Eve runtime 已分别通过原生 MCP Client 直连 Toolbox。加载本 Skill 后，调用当前 runtime 对应的 Toolbox MCP Tool；不要绕过 Toolbox 执行任意 SQL。官方生成器产出的数据库直连脚本不会安装到 Agent 的 Skill 目录。

## Workflow

1. 要求或确认不超过 31 天的 UTC `[from, to)` 时间窗，并设置有界 `limit`。
2. 调用 `mcp__toolbox__list-ecommerce-fulfillment-exceptions` 获取已支付未履约订单。
3. 将 `to` 解释为等待时长的参考时间，不要当作当前系统时间。
4. 需要订单项时，仅对具体异常订单调用 `mcp__toolbox__get-ecommerce-order-detail`。

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，先读取 `references/ecommerce-semantic-catalog.yaml`。只使用其中认证的术语、口径和 Tool；遇到标记为 `clarify` 的术语，先向用户澄清，不要猜测或生成任意 SQL。

## Available Toolbox tools

### `mcp__toolbox__get-ecommerce-order-detail`

返回一笔合成电商订单及其客户业务背景和订单项。
通过明确的 orderNumber 精确查询，返回的客户信息仅为合成业务属性。

#### Parameters

| Name        | Type   | Description                            | Required | Default |
| :---------- | :----- | :------------------------------------- | :------- | :------ |
| orderNumber | string | 明确的电商订单号，例如 EC20260601001。 | Yes      |         |

---

### `mcp__toolbox__list-ecommerce-fulfillment-exceptions`

列出有界 UTC 时间窗内 status = PAID 且 fulfilledAt 为空的合成电商订单。
hoursWaiting 以参数 to 为等待时长参考时刻，不代表实时系统时间。

#### Parameters

| Name   | Type    | Description                                                                                            | Required | Default |
| :----- | :------ | :----------------------------------------------------------------------------------------------------- | :------- | :------ |
| from   | string  | ISO-8601 UTC 已付款订单时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。                             | Yes      |         |
| to     | string  | ISO-8601 UTC 已付款订单时间窗结束时间（不包含），同时作为等待时长参考时间，例如 2026-06-02T00:00:00Z。 | Yes      |         |
| limit  | integer | 最多返回的履约异常订单数量。                                                                           | No       | `50`    |
| offset | integer | 从稳定排序结果中跳过的履约异常数量，用于分页；首页传 0。                                               | No       | `0`     |

---
