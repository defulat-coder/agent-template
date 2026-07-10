---
name: ecommerce-sales-analysis
description: Analyzes ecommerce revenue, refunds, net sales, buyers, and channel performance. Use when the user asks about sales trends, GMV, refunds, net sales, or channel comparison.
---

## Usage

All scripts can be executed using Node.js. Replace `<param_name>` and `<param_value>` with actual values.

**Bash:**
`node <skill_dir>/scripts/<script_name>.js '{"<param_name>": "<param_value>"}'`

**PowerShell:**
`node <skill_dir>/scripts/<script_name>.js '{\"<param_name>\": \"<param_value>\"}'`


## Scripts


### summarize-ecommerce-sales-by-channel

Compare synthetic ecommerce sales performance across web, mini program, marketplace, and live stream channels.
Use this read-only tool for bounded channel-performance analysis.


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | Inclusive ISO-8601 UTC sales window start. | Yes |  |
| to | string | Exclusive ISO-8601 UTC sales window end. | Yes |  |


---

### summarize-ecommerce-sales-by-day

Summarize synthetic ecommerce gross sales, refunds, net sales, orders, and buyers by day.
Use this read-only tool for bounded sales-trend analysis in an ISO-8601 UTC time window.


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | Inclusive ISO-8601 UTC sales window start. | Yes |  |
| to | string | Exclusive ISO-8601 UTC sales window end. | Yes |  |


---

