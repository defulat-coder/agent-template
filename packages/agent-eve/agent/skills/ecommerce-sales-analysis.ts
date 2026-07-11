import { defineDynamic, defineSkill } from "eve/skills";
import { hasToolboxCapabilities } from "../lib/capability-profile";
import { ecommerceSemanticCatalog } from "../lib/ecommerce-semantic-catalog";

const requiredTools = [
  "summarize-ecommerce-sales-by-channel",
  "summarize-ecommerce-sales-by-day",
  "summarize_sales_by_customer_segment",
  "summarize_sales_by_region",
] as const;
const skill = defineSkill({
  description:
    "分析电商销售额、退款、净销售额、买家数与渠道表现。用户询问销售趋势、GMV、退款、净销售额或渠道对比时使用。",
  markdown:
    "## Usage\n\n本项目的 Claude 与 Eve runtime 已分别通过原生 MCP Client 直连 Toolbox。加载本 Skill 后，调用当前 runtime 对应的 Toolbox MCP Tool；不要绕过 Toolbox 执行任意 SQL。官方生成器产出的数据库直连脚本不会安装到 Agent 的 Skill 目录。\n\n## Workflow\n\n1. 要求或确认不超过 31 天的 UTC `[from, to)` 时间窗。\n2. 先调用 `toolbox__summarize-ecommerce-sales-by-day` 判断趋势和异常日期。\n3. 需要渠道归因时，再调用 `toolbox__summarize-ecommerce-sales-by-channel`。\n4. 用户询问大区时调用 `toolbox__summarize_sales_by_region`；询问新客、活跃、VIP 或流失风险人群时调用 `toolbox__summarize_sales_by_customer_segment`。\n5. 指标口径仅包含 `PAID`、`FULFILLED` 和 `REFUNDED` 订单；明确区分 `grossSales`、`refundAmount` 与 `netSales`。\n6. 渠道、区域和分群 `averageOrderValue` 是平均单笔净销售额，不要把退款前销售额描述成实际收入。\n\n## Business semantic catalog\n\n涉及业务术语、指标、维度或枚举取值时，先读取 `references/ecommerce-semantic-catalog.yaml`。只使用其中认证的术语、口径和 Tool；遇到标记为 `clarify` 的术语，先向用户澄清，不要猜测或生成任意 SQL。\n\n## Available Toolbox tools\n\n### `toolbox__summarize-ecommerce-sales-by-channel`\n\n对比 Web、小程序、平台和直播渠道的已结算订单（PAID、FULFILLED、REFUNDED）。\ngrossSales 为付款总额，refundAmount 为退款总额，netSales 为两者差额，averageOrderValue 为平均单笔净销售额。\n\n#### Parameters\n\n| Name | Type   | Description                                                            | Required | Default |\n| :--- | :----- | :--------------------------------------------------------------------- | :------- | :------ |\n| from | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |\n| to   | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |\n\n---\n\n### `toolbox__summarize-ecommerce-sales-by-day`\n\n按付款日汇总已结算订单（PAID、FULFILLED、REFUNDED）的销售表现。\ngrossSales 为 paidTotal 之和，refundAmount 为 refundedTotal 之和，netSales = grossSales - refundAmount。\n返回每日付款订单数和去重买家数，适用于有界 UTC 销售趋势分析。\n\n#### Parameters\n\n| Name | Type   | Description                                                            | Required | Default |\n| :--- | :----- | :--------------------------------------------------------------------- | :------- | :------ |\n| from | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |\n| to   | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |\n\n---\n\n### `toolbox__summarize_sales_by_customer_segment`\n\n按合成客户分群汇总已结算订单（PAID、FULFILLED、REFUNDED）的销售表现。\ncustomerSegment 使用数据库枚举值 NEW、ACTIVE、VIP、AT_RISK；grossSales、refundAmount、netSales 与 averageOrderValue 口径和销售趋势 Tool 一致。\n\n#### Parameters\n\n| Name | Type   | Description                                                            | Required | Default |\n| :--- | :----- | :--------------------------------------------------------------------- | :------- | :------ |\n| from | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |\n| to   | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |\n\n---\n\n### `toolbox__summarize_sales_by_region`\n\n按客户大区汇总已结算订单（PAID、FULFILLED、REFUNDED）的销售表现。\ngrossSales 为付款总额，refundAmount 为退款总额，netSales 为两者差额，averageOrderValue 为平均单笔净销售额。\n区域来自合成客户档案 customer.region，仅适用于有界 UTC 付款时间窗，不返回客户联系方式或明细。\n\n#### Parameters\n\n| Name | Type   | Description                                                            | Required | Default |\n| :--- | :----- | :--------------------------------------------------------------------- | :------- | :------ |\n| from | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |\n| to   | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |\n\n---\n",
  files: {
    "references/ecommerce-semantic-catalog.yaml": ecommerceSemanticCatalog,
  },
});

export default defineDynamic({
  events: {
    "session.started": () =>
      hasToolboxCapabilities(requiredTools) ? skill : null,
  },
});
