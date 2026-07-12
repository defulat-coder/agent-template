---
name: logistics-operations
description: 分析承运商表现、物流异常、包裹轨迹、配送 SLA 和运费。用户询问延迟、丢件、物流时效或履约成本时使用。
---

## Usage

All scripts can be executed using Node.js. Replace `<param_name>` and `<param_value>` with actual values.

**Bash:**
`node <skill_dir>/scripts/<script_name>.js '{"<param_name>": "<param_value>"}'`

**PowerShell:**
`node <skill_dir>/scripts/<script_name>.js '{\"<param_name>\": \"<param_value>\"}'`

1. 先确认订单、包裹或分析时间窗，并区分下单、发货和签收时间。
2. 趋势问题先调用 `summarize_carrier_performance` 或 `summarize_delivery_sla`。
3. 异常排查调用 `list_logistics_exceptions`，具体包裹再调用 `get_shipment_trace`。
4. 成本问题调用 `summarize_freight_costs`，不要从运费推断完整订单利润。
5. 明确说明 SLA、异常状态和参考时间，不把模拟数据描述成实时物流状态。


## Scripts


### get_shipment_trace

通过明确的合成运单号返回运单、订单和按时间排序的物流轨迹事件。
结果最多返回 100 条事件；事件 location 和 detail 均为合成运营信息，不代表实时物流状态。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| shipmentNumber | string | 明确的合成运单号，例如 SHP-20260601-0001。 | Yes |  |
| limit | integer | 最多返回的物流轨迹事件数量。 | No | `100` |


---

### list_logistics_exceptions

分页返回明确 UTC 发货时间窗内状态异常、签收超时或截至 to 已超过承诺时间仍未签收的运单。
结果包含合成订单、仓库、承运商和异常等待小时数，按超时程度和运单 ID 稳定排序。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 发货时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 发货时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |
| limit | integer | 最多返回的异常运单数量。 | No | `50` |
| offset | integer | 从稳定排序结果中跳过的异常运单数量；首页传 0。 | No | `0` |


---

### summarize_carrier_performance

按承运商汇总明确 UTC 发货时间窗内的运单量、签收量、准时率、异常量和平均配送时长。
准时签收定义为 deliveredAt <= promisedAt；未签收运单不计入平均配送时长。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 发货时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 发货时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

### summarize_delivery_sla

按承诺签收日汇总明确 UTC 发货时间窗内的配送 SLA：准时、迟到和截至 to 未签收运单。
onTimeDeliveryRate 仅以已签收运单为分母；未签收积压单独返回，避免伪造完成时效。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 发货时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 发货时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

### summarize_freight_costs

按承运商汇总明确 UTC 发货时间窗内的运费、平均每单运费、运输距离和每公里成本。
freightCost 仅表示合成物流运费，不包含仓储、包装或逆向物流成本，也不能单独代表订单利润。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 发货时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 发货时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

