---
name: ecommerce-order-operations
description: 通过有界订单列表和精确订单明细排查电商订单。用户询问订单状态、客户分群背景、具体订单号或订单级故障时使用。
---

## Usage

本项目的 Claude 与 Eve runtime 已分别通过原生 MCP Client 直连 Toolbox。加载本 Skill 后，调用当前 runtime 对应的 Toolbox MCP Tool；不要绕过 Toolbox 执行任意 SQL。官方生成器产出的数据库直连脚本不会安装到 Agent 的 Skill 目录。

## Workflow

1. 用户提供订单号时，直接调用 `toolbox__get-ecommerce-order-detail`，不要先扫描订单列表。
2. 用户询问一段时间的订单时，调用 `toolbox__list-ecommerce-orders-in-window`，时间窗不超过 31 天且结果有界。
3. 需要继续核查时，只对用户选中的具体订单调用详情 Tool。
4. 返回合成 customer code、segment 和地区即可；不要声称存在联系方式或真实个人信息。

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，先读取 `references/ecommerce-semantic-catalog.yaml`。只使用其中认证的术语、口径和 Tool；遇到标记为 `clarify` 的术语，先向用户澄清，不要猜测或生成任意 SQL。

## Available Toolbox tools

### `toolbox__get-ecommerce-order-detail`

返回一笔合成电商订单及其客户业务背景和订单项。
通过明确的 orderNumber 精确查询，返回的客户信息仅为合成业务属性。

#### Parameters

| Name        | Type   | Description                            | Required | Default |
| :---------- | :----- | :------------------------------------- | :------- | :------ |
| orderNumber | string | 明确的电商订单号，例如 EC20260601001。 | Yes      |         |

---

### `toolbox__list-ecommerce-orders-in-window`

返回合成电商数据的有界订单运营视图。
时间口径为 placedAt；客户数据仅包含合成客户编码、分群和地区，不返回直接联系方式。

#### Parameters

| Name   | Type    | Description                                                                | Required | Default |
| :----- | :------ | :------------------------------------------------------------------------- | :------- | :------ |
| from   | string  | ISO-8601 UTC 订单运营时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to     | string  | ISO-8601 UTC 订单运营时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |
| limit  | integer | 最多返回的订单数量。                                                       | No       | `50`    |
| offset | integer | 从稳定排序结果中跳过的订单数量，用于分页；首页传 0。                       | No       | `0`     |

---
