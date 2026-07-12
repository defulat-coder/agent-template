import { defineDynamic, defineSkill } from "eve/skills";
import { hasToolboxSkill } from "../lib/capability-profile";
import { businessSemanticCatalogs } from "../lib/business-semantic-catalogs";

const skill = defineSkill({
  description:
    "按销量、商品销售总额和退款调整后的净商品销售额分析商品表现。用户询问商品排行、畅销商品、品类表现或选品分析时使用。",
  markdown:
    "## Usage\n\n本项目通过可执行语义层访问 Toolbox。加载本 Skill 后，必须调用 `query_business_data`，传入用户原始问题和本目录中的 canonical candidate；不要直接调用底层业务 Toolbox Tool，也不要生成 SQL。语义 Tool 会完成消歧、时间归一、认证查询契约选择、Toolbox 执行和结果来源封装。\n\n## Workflow\n\n1. 读取 `references/ecommerce.yaml`，从中选择 catalog、intent、metric 和 dimension canonical id。\n2. 调用 `query_business_data`；不得提交 Tool 名、SQL、表名、列名、租户或授权范围。\n3. 返回 `clarification` 时向用户原样澄清，取得答案后重新解析；不要猜测。\n4. 返回 `unsupported` 时说明当前认证查询目录的限制；不要绕过语义层。\n5. 返回 `result` 时只依据 Semantic result envelope 回答，并说明指标、UTC `[from, to)` 时间窗、维度、过滤和限制。\n\n## Business semantic catalog\n\n涉及业务术语、指标、维度或枚举取值时，只使用该目录认证的术语和口径。底层认证路径为 `list-ecommerce-top-products`、`summarize_merchandise_by_category`，仅供理解覆盖范围，不能由模型直接调用。\n\n## Internal certified query paths\n\n### list-ecommerce-top-products\n\n按已结算订单的销量、grossMerchandiseSales 和 netMerchandiseSales 对合成电商商品排行。\n订单级 refundedTotal 按商品 lineTotal 占 paidTotal 的比例分摊；商品销售额不包含运费。\n\n#### Parameters\n\n| Name     | Type    | Description                                                            | Required | Default |\n| :------- | :------ | :--------------------------------------------------------------------- | :------- | :------ |\n| from     | string  | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |\n| to       | string  | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |\n| limit    | integer | 最多返回的商品数量。                                                   | No       | `20`    |\n| offset   | integer | 从稳定排序结果中跳过的商品数量，用于分页；首页传 0。                   | No       | `0`     |\n| category | string  | 可选的认证商品品类过滤值；ALL 表示返回全部品类。                       | No       | `ALL`   |\n\n---\n\n### summarize_merchandise_by_category\n\n按商品品类汇总已结算订单项的销量、商品销售额和退款后商品销售额。\ngrossMerchandiseSales 不包含运费；netMerchandiseSales 将订单级 refundedTotal 按 lineTotal / paidTotal 分摊到订单项。\n\n#### Parameters\n\n| Name     | Type   | Description                                                            | Required | Default |\n| :------- | :----- | :--------------------------------------------------------------------- | :------- | :------ |\n| from     | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |\n| to       | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |\n| category | string | 可选的认证商品品类过滤值；ALL 表示返回全部品类。                       | No       | `ALL`   |\n\n---\n",
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
