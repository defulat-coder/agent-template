---
name: ecommerce-order-operations
description: 通过有界订单列表和精确订单明细排查电商订单。用户询问订单状态、客户分群背景、具体订单号或订单级故障时使用。
---

## Usage

本项目通过可执行语义层访问 Toolbox。加载本 Skill 后，必须调用 `mcp__semantic_query__query_business_data`，传入用户原始问题和本目录中的 canonical candidate；不要直接调用底层业务 Toolbox Tool，也不要生成 SQL。语义 Tool 会完成消歧、时间归一、认证查询契约选择、Toolbox 执行和结果来源封装。

## Workflow

1. 读取 `references/ecommerce.yaml`，从中选择 catalog、intent、metric 和 dimension canonical id。
2. 调用 `mcp__semantic_query__query_business_data`；不得提交 Tool 名、SQL、表名、列名、租户或授权范围。
3. 返回 `clarification` 时向用户原样澄清，取得答案后重新解析；不要猜测。
4. 返回 `unsupported` 时说明当前认证查询目录的限制；不要绕过语义层。
5. 返回 `result` 时只依据 Semantic result envelope 回答，并说明指标、UTC `[from, to)` 时间窗、维度、过滤和限制。

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，只使用该目录认证的术语和口径。底层认证路径为 `get-ecommerce-order-detail`、`list-ecommerce-orders-in-window`，仅供理解覆盖范围，不能由模型直接调用。

## Internal certified query paths

### get-ecommerce-order-detail

返回一笔合成电商订单及其客户业务背景和订单项。
通过明确的 orderNumber 精确查询，返回的客户信息仅为合成业务属性。

#### Parameters

| Name        | Type   | Description                            | Required | Default |
| :---------- | :----- | :------------------------------------- | :------- | :------ |
| orderNumber | string | 明确的电商订单号，例如 EC20260601001。 | Yes      |         |

---

### list-ecommerce-orders-in-window

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
