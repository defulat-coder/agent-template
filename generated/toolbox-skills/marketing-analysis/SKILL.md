---
name: marketing-analysis
description: 分析营销活动、渠道、优惠券、低效活动和获客表现。用户询问投放效果、促销转化、优惠成本或获客时使用。
---

## Usage

All scripts can be executed using Node.js. Replace `<param_name>` and `<param_value>` with actual values.

**Bash:**
`node <skill_dir>/scripts/<script_name>.js '{"<param_name>": "<param_value>"}'`

**PowerShell:**
`node <skill_dir>/scripts/<script_name>.js '{\"<param_name>\": \"<param_value>\"}'`

1. 先确认活动时间窗、渠道和目标指标。
2. 活动总览调用 `summarize_campaign_performance`，渠道归因调用 `summarize_marketing_by_channel`。
3. 优惠使用调用 `summarize_coupon_performance`，异常活动调用 `list_underperforming_campaigns`。
4. 获客问题调用 `summarize_customer_acquisition`。
5. 区分归因收入、优惠成本和获客成本；没有实验或增量数据时不要声称因果提升。


## Scripts


### list_underperforming_campaigns

分页返回与明确 UTC 时间窗重叠、窗口内有归因费用且归因收入低于归因费用的活动。
低效判断只比较同一窗口内 attributedRevenue 与 allocatedSpend；活动 spend/budget 仅作为档案返回，不参与部分窗口 ROAS 判定。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 活动评估时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 活动评估时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |
| limit | integer | 最多返回的低效活动数量。 | No | `50` |
| offset | integer | 从稳定排序结果中跳过的低效活动数量；首页传 0。 | No | `0` |


---

### summarize_campaign_performance

按营销活动汇总明确 UTC 触点时间窗内的归因订单、归因收入、分摊费用、新客数和 ROAS。
attributedRevenue 是规则归因结果，不代表增量收入或因果效果；活动 budget/spend 是完整活动档案值。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 营销触点时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 营销触点时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

### summarize_coupon_performance

按优惠券编码汇总明确 UTC 触点时间窗内的使用订单、归因收入、分摊费用、新客和平均归因订单金额。
couponCode 仅表示营销归因记录中的合成优惠标识，不包含优惠券面值或完整促销成本。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 优惠归因时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 优惠归因时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

### summarize_customer_acquisition

按归因渠道汇总明确 UTC 触点时间窗内的新客数、新客归因收入、分摊费用和获客成本。
customerAcquisitionCost = 新客触点 allocatedSpend / 去重新客订单数；没有实验数据时不得解释为增量获客效果。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 新客归因时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 新客归因时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

### summarize_marketing_by_channel

按归因渠道汇总明确 UTC 触点时间窗内的订单、归因收入、分摊费用、新客和 ROAS。
channel 来自 MarketingAttribution；跨渠道归因可能包含同一订单的多个触点，回答不得直接等同于独立订单总数。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 营销触点时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 营销触点时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

