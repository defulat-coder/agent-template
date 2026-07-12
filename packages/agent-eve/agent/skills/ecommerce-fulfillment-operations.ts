import { defineDynamic, defineSkill } from "eve/skills";
import { hasToolboxSkill } from "../lib/capability-profile";
import { businessSemanticCatalogs } from "../lib/business-semantic-catalogs";

const skill = defineSkill({
  description:
    "查找已付款但未履约的电商订单并支持履约异常排查。用户询问履约积压、等待时长、延迟订单或运营异常时使用。",
  markdown:
    "## Usage\n\n本项目通过可执行语义层访问 Toolbox。加载本 Skill 后，必须调用 `query_business_data`，传入用户原始问题和本目录中的 canonical candidate；不要直接调用底层业务 Toolbox Tool，也不要生成 SQL。语义 Tool 会完成消歧、时间归一、认证查询契约选择、Toolbox 执行和结果来源封装。\n\n## Workflow\n\n1. 读取 `references/ecommerce.yaml`，从中选择 catalog、intent、metric 和 dimension canonical id。\n2. 调用 `query_business_data`；不得提交 Tool 名、SQL、表名、列名、租户或授权范围。\n3. 返回 `clarification` 时向用户原样澄清，取得答案后重新解析；不要猜测。\n4. 返回 `unsupported` 时说明当前认证查询目录的限制；不要绕过语义层。\n5. 返回 `result` 时只依据 Semantic result envelope 回答，并说明指标、UTC `[from, to)` 时间窗、维度、过滤和限制。\n\n## Business semantic catalog\n\n涉及业务术语、指标、维度或枚举取值时，只使用该目录认证的术语和口径。底层认证路径为 `get-ecommerce-order-detail`、`list-ecommerce-fulfillment-exceptions`，仅供理解覆盖范围，不能由模型直接调用。\n\n## Internal certified query paths\n\n### get-ecommerce-order-detail\n\n返回一笔合成电商订单及其客户业务背景和订单项。\n通过明确的 orderNumber 精确查询，返回的客户信息仅为合成业务属性。\n\n#### Parameters\n\n| Name        | Type   | Description                            | Required | Default |\n| :---------- | :----- | :------------------------------------- | :------- | :------ |\n| orderNumber | string | 明确的电商订单号，例如 EC20260601001。 | Yes      |         |\n\n---\n\n### list-ecommerce-fulfillment-exceptions\n\n列出有界 UTC 时间窗内 status = PAID 且 fulfilledAt 为空的合成电商订单。\nhoursWaiting 以参数 to 为等待时长参考时刻，不代表实时系统时间。\n\n#### Parameters\n\n| Name   | Type    | Description                                                                                            | Required | Default |\n| :----- | :------ | :----------------------------------------------------------------------------------------------------- | :------- | :------ |\n| from   | string  | ISO-8601 UTC 已付款订单时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。                             | Yes      |         |\n| to     | string  | ISO-8601 UTC 已付款订单时间窗结束时间（不包含），同时作为等待时长参考时间，例如 2026-06-02T00:00:00Z。 | Yes      |         |\n| limit  | integer | 最多返回的履约异常订单数量。                                                                           | No       | `50`    |\n| offset | integer | 从稳定排序结果中跳过的履约异常数量，用于分页；首页传 0。                                               | No       | `0`     |\n\n---\n",
  files: {
    "references/ecommerce.yaml": businessSemanticCatalogs["ecommerce.yaml"],
  },
});

export default defineDynamic({
  events: {
    "session.started": () =>
      hasToolboxSkill("ecommerce-fulfillment-operations") ? skill : null,
  },
});
