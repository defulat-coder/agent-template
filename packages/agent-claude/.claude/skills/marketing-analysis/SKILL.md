---
name: marketing-analysis
description: 分析营销活动、渠道、优惠券、低效活动和获客表现。用户询问投放效果、促销转化、优惠成本或获客时使用。
---

## Usage

本项目通过可执行语义层访问 Toolbox。加载本 Skill 后，必须调用 `mcp__semantic_query__query_business_data`，传入用户原始问题和本目录中的 canonical candidate；不要直接调用底层业务 Toolbox Tool，也不要生成 SQL。语义 Tool 会完成消歧、时间归一、认证查询契约选择、Toolbox 执行和结果来源封装。

## Workflow

1. 读取 `references/marketing.yaml`，从中选择 catalog、intent、metric 和 dimension canonical id。
2. 调用 `mcp__semantic_query__query_business_data`；不得提交 Tool 名、SQL、表名、列名、租户或授权范围。
3. 返回 `clarification` 时向用户原样澄清，取得答案后重新解析；不要猜测。
4. 返回 `unsupported` 时说明当前认证查询目录的限制；不要绕过语义层。
5. 返回 `result` 时只依据 Semantic result envelope 回答，并说明指标、UTC `[from, to)` 时间窗、维度、过滤和限制。

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，只使用该目录认证的术语和口径。底层认证路径为 `list_underperforming_campaigns`、`summarize_campaign_performance`、`summarize_coupon_performance`、`summarize_customer_acquisition`、`summarize_marketing_by_channel`，仅供理解覆盖范围，不能由模型直接调用。

## Internal certified query paths

### list_underperforming_campaigns

分页返回与明确 UTC 时间窗重叠、窗口内有归因费用且归因收入低于归因费用的活动。
低效判断只比较同一窗口内 attributedRevenue 与 allocatedSpend；活动 spend/budget 仅作为档案返回，不参与部分窗口 ROAS 判定。

#### Parameters

| Name   | Type    | Description                                                                | Required | Default |
| :----- | :------ | :------------------------------------------------------------------------- | :------- | :------ |
| from   | string  | ISO-8601 UTC 活动评估时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to     | string  | ISO-8601 UTC 活动评估时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |
| limit  | integer | 最多返回的低效活动数量。                                                   | No       | `50`    |
| offset | integer | 从稳定排序结果中跳过的低效活动数量；首页传 0。                             | No       | `0`     |

---

### summarize_campaign_performance

按营销活动汇总明确 UTC 触点时间窗内的归因订单、归因收入、分摊费用、新客数和 ROAS。
attributedRevenue 是规则归因结果，不代表增量收入或因果效果；活动 budget/spend 是完整活动档案值。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 营销触点时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 营销触点时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_coupon_performance

按优惠券编码汇总明确 UTC 触点时间窗内的使用订单、归因收入、分摊费用、新客和平均归因订单金额。
couponCode 仅表示营销归因记录中的合成优惠标识，不包含优惠券面值或完整促销成本。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 优惠归因时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 优惠归因时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_customer_acquisition

按归因渠道汇总明确 UTC 触点时间窗内的新客数、新客归因收入、分摊费用和获客成本。
customerAcquisitionCost = 新客触点 allocatedSpend / 去重新客订单数；没有实验数据时不得解释为增量获客效果。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 新客归因时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 新客归因时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_marketing_by_channel

按归因渠道汇总明确 UTC 触点时间窗内的订单、归因收入、分摊费用、新客和 ROAS。
channel 来自 MarketingAttribution；跨渠道归因可能包含同一订单的多个触点，回答不得直接等同于独立订单总数。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 营销触点时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 营销触点时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---
