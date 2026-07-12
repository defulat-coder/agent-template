import { defineDynamic, defineSkill } from "eve/skills";
import { hasToolboxSkill } from "../lib/capability-profile";
import { businessSemanticCatalogs } from "../lib/business-semantic-catalogs";

const skill = defineSkill({
  description:
    "按销量、商品销售总额和退款调整后的净商品销售额分析商品表现。用户询问商品排行、畅销商品、品类表现或选品分析时使用。",
  markdown:
    "## Usage\n\n本项目的 Claude 与 Eve runtime 已分别通过原生 MCP Client 直连 Toolbox。加载本 Skill 后，调用当前 runtime 对应的 Toolbox MCP Tool；不要绕过 Toolbox 执行任意 SQL。官方生成器产出的数据库直连脚本不会安装到 Agent 的 Skill 目录。\n\n## Workflow\n\n1. 要求或确认不超过 31 天的 UTC `[from, to)` 时间窗，并设置有界 `limit`。\n2. 调用 `toolbox__list-ecommerce-top-products` 获取商品排行。\n3. 用户询问品类时调用 `toolbox__summarize_merchandise_by_category`，不把商品排行当作品类汇总。\n4. 同时解释销量、毛商品销售额与退款分摊后的净商品销售额；这两个销售额都不包含运费。\n5. 不从排行结果推断库存、利润或转化率；当前 Tool 没有这些字段。\n\n## Business semantic catalog\n\n涉及业务术语、指标、维度或枚举取值时，先读取 `references/ecommerce.yaml`。只使用其中认证的术语、口径和 Tool；遇到标记为 `clarify` 的术语，先向用户澄清，不要猜测或生成任意 SQL。\n\n## Available Toolbox tools\n\n### `toolbox__list-ecommerce-top-products`\n\n按已结算订单的销量、grossMerchandiseSales 和 netMerchandiseSales 对合成电商商品排行。\n订单级 refundedTotal 按商品 lineTotal 占 paidTotal 的比例分摊；商品销售额不包含运费。\n\n#### Parameters\n\n| Name   | Type    | Description                                                            | Required | Default |\n| :----- | :------ | :--------------------------------------------------------------------- | :------- | :------ |\n| from   | string  | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |\n| to     | string  | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |\n| limit  | integer | 最多返回的商品数量。                                                   | No       | `20`    |\n| offset | integer | 从稳定排序结果中跳过的商品数量，用于分页；首页传 0。                   | No       | `0`     |\n\n---\n\n### `toolbox__summarize_merchandise_by_category`\n\n按商品品类汇总已结算订单项的销量、商品销售额和退款后商品销售额。\ngrossMerchandiseSales 不包含运费；netMerchandiseSales 将订单级 refundedTotal 按 lineTotal / paidTotal 分摊到订单项。\n\n#### Parameters\n\n| Name | Type   | Description                                                            | Required | Default |\n| :--- | :----- | :--------------------------------------------------------------------- | :------- | :------ |\n| from | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |\n| to   | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |\n\n---\n",
  files: {
    "references/ecommerce.yaml": businessSemanticCatalogs["ecommerce.yaml"],
  },
});

export default defineDynamic({
  events: {
    "session.started": () =>
      hasToolboxSkill("ecommerce-product-analysis") ? skill : null,
  },
});
