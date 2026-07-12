import { z } from "zod";

export const toolboxCapabilityPacks = {
  "platform-observability": {
    kind: "technical",
    scope: "agent-template:observe",
    tools: [
      "list-template-events",
      "get-template-event",
      "list-template-events-in-window",
      "summarize-template-events-by-type",
      "list-agent-runs",
      "get-agent-run-summary",
      "list-agent-run-timeline",
      "list-failed-agent-runs-in-window",
      "summarize-tool-invocations",
    ],
  },
  "ecommerce-sales-analysis": {
    kind: "business",
    catalog: "ecommerce.yaml",
    scope: "ecommerce:read",
    skill: {
      name: "ecommerce-sales-analysis",
      description:
        "分析电商销售额、退款、净销售额、买家数与渠道表现。用户询问销售趋势、GMV、退款、净销售额或渠道对比时使用。",
      workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗。
2. 先调用 \`summarize-ecommerce-sales-by-day\` 判断趋势和异常日期。
3. 需要渠道归因时，再调用 \`summarize-ecommerce-sales-by-channel\`。
4. 用户询问大区时调用 \`summarize_sales_by_region\`；询问新客、活跃、VIP 或流失风险人群时调用 \`summarize_sales_by_customer_segment\`。
5. 指标口径仅包含 \`PAID\`、\`FULFILLED\` 和 \`REFUNDED\` 订单；明确区分 \`grossSales\`、\`refundAmount\` 与 \`netSales\`。
6. 渠道、区域和分群 \`averageOrderValue\` 是平均单笔净销售额，不要把退款前销售额描述成实际收入。`,
    },
    tools: [
      "summarize-ecommerce-sales-by-day",
      "summarize-ecommerce-sales-by-channel",
      "summarize_sales_by_region",
      "summarize_sales_by_customer_segment",
    ],
    toolset: "ecommerce-sales-analytics",
  },
  "ecommerce-product-analysis": {
    kind: "business",
    catalog: "ecommerce.yaml",
    scope: "ecommerce:read",
    skill: {
      name: "ecommerce-product-analysis",
      description:
        "按销量、商品销售总额和退款调整后的净商品销售额分析商品表现。用户询问商品排行、畅销商品、品类表现或选品分析时使用。",
      workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗，并设置有界 \`limit\`。
2. 调用 \`list-ecommerce-top-products\` 获取商品排行。
3. 用户询问品类时调用 \`summarize_merchandise_by_category\`，不把商品排行当作品类汇总。
4. 同时解释销量、毛商品销售额与退款分摊后的净商品销售额；这两个销售额都不包含运费。
5. 不从排行结果推断库存、利润或转化率；当前 Tool 没有这些字段。`,
    },
    tools: ["list-ecommerce-top-products", "summarize_merchandise_by_category"],
    toolset: "ecommerce-product-analytics",
  },
  "ecommerce-order-operations": {
    kind: "business",
    catalog: "ecommerce.yaml",
    scope: "ecommerce:read",
    skill: {
      name: "ecommerce-order-operations",
      description:
        "通过有界订单列表和精确订单明细排查电商订单。用户询问订单状态、客户分群背景、具体订单号或订单级故障时使用。",
      workflow: `1. 用户提供订单号时，直接调用 \`get-ecommerce-order-detail\`，不要先扫描订单列表。
2. 用户询问一段时间的订单时，调用 \`list-ecommerce-orders-in-window\`，时间窗不超过 31 天且结果有界。
3. 需要继续核查时，只对用户选中的具体订单调用详情 Tool。
4. 返回合成 customer code、segment 和地区即可；不要声称存在联系方式或真实个人信息。`,
    },
    tools: ["list-ecommerce-orders-in-window", "get-ecommerce-order-detail"],
    toolset: "ecommerce-order-operations",
  },
  "ecommerce-fulfillment-operations": {
    kind: "business",
    catalog: "ecommerce.yaml",
    scope: "ecommerce:read",
    skill: {
      name: "ecommerce-fulfillment-operations",
      description:
        "查找已付款但未履约的电商订单并支持履约异常排查。用户询问履约积压、等待时长、延迟订单或运营异常时使用。",
      workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗，并设置有界 \`limit\`。
2. 调用 \`list-ecommerce-fulfillment-exceptions\` 获取已支付未履约订单。
3. 将 \`to\` 解释为等待时长的参考时间，不要当作当前系统时间。
4. 需要订单项时，仅对具体异常订单调用 \`get-ecommerce-order-detail\`。`,
    },
    tools: [
      "list-ecommerce-fulfillment-exceptions",
      "get-ecommerce-order-detail",
    ],
    toolset: "ecommerce-fulfillment-operations",
  },
  "finance-analysis": {
    kind: "business",
    catalog: "finance.yaml",
    scope: "finance:read",
    skill: {
      name: "finance-analysis",
      description:
        "分析经营财务概览、支付方式、退款原因、发票异常和渠道结算差异。用户询问收入质量、收退款、开票或对账时使用。",
      workflow: `1. 先确认用户关注的业务时间窗和财务口径。
2. 调用 \`summarize_finance_overview\` 建立收入、退款与净额概览。
3. 支付结构问题调用 \`summarize_payment_methods\`，退款问题调用 \`summarize_refunds_by_reason\`。
4. 开票排查调用 \`list_invoice_exceptions\`，渠道对账调用 \`reconcile_channel_settlements\`。
5. 严格区分销售、实收、退款、发票与渠道结算；不要把经营指标描述成法定财务报表。`,
    },
    tools: [
      "summarize_finance_overview",
      "summarize_payment_methods",
      "summarize_refunds_by_reason",
      "list_invoice_exceptions",
      "reconcile_channel_settlements",
    ],
    toolset: "finance-analysis",
  },
  "logistics-operations": {
    kind: "business",
    catalog: "logistics.yaml",
    scope: "logistics:read",
    skill: {
      name: "logistics-operations",
      description:
        "分析承运商表现、物流异常、包裹轨迹、配送 SLA 和运费。用户询问延迟、丢件、物流时效或履约成本时使用。",
      workflow: `1. 先确认订单、包裹或分析时间窗，并区分下单、发货和签收时间。
2. 趋势问题先调用 \`summarize_carrier_performance\` 或 \`summarize_delivery_sla\`。
3. 异常排查调用 \`list_logistics_exceptions\`，具体包裹再调用 \`get_shipment_trace\`。
4. 成本问题调用 \`summarize_freight_costs\`，不要从运费推断完整订单利润。
5. 明确说明 SLA、异常状态和参考时间，不把模拟数据描述成实时物流状态。`,
    },
    tools: [
      "summarize_carrier_performance",
      "list_logistics_exceptions",
      "get_shipment_trace",
      "summarize_delivery_sla",
      "summarize_freight_costs",
    ],
    toolset: "logistics-operations",
  },
  "supply-chain-operations": {
    kind: "business",
    catalog: "supply-chain.yaml",
    scope: "supply-chain:read",
    skill: {
      name: "supply-chain-operations",
      description:
        "分析库存健康、缺货风险、仓库库存、采购支出、供应商表现和采购单异常。用户询问补货、库存或采购运营时使用。",
      workflow: `1. 先确认库存快照或采购时间窗，并明确仓库、SKU 或供应商范围。
2. 库存全局判断先调用 \`summarize_inventory_health\`，风险排查调用 \`list_stockout_risks\`。
3. 仓库对比调用 \`summarize_inventory_by_warehouse\`。
4. 采购分析调用 \`summarize_procurement_spend\` 和 \`summarize_supplier_performance\`，具体异常调用 \`list_purchase_order_exceptions\`。
5. 区分可售、占用、在途和安全库存；不要用单一库存快照推断历史缺货。`,
    },
    tools: [
      "summarize_inventory_health",
      "list_stockout_risks",
      "summarize_inventory_by_warehouse",
      "summarize_procurement_spend",
      "summarize_supplier_performance",
      "list_purchase_order_exceptions",
    ],
    toolset: "supply-chain-operations",
  },
  "marketing-analysis": {
    kind: "business",
    catalog: "marketing.yaml",
    scope: "marketing:read",
    skill: {
      name: "marketing-analysis",
      description:
        "分析营销活动、渠道、优惠券、低效活动和获客表现。用户询问投放效果、促销转化、优惠成本或获客时使用。",
      workflow: `1. 先确认活动时间窗、渠道和目标指标。
2. 活动总览调用 \`summarize_campaign_performance\`，渠道归因调用 \`summarize_marketing_by_channel\`。
3. 优惠使用调用 \`summarize_coupon_performance\`，异常活动调用 \`list_underperforming_campaigns\`。
4. 获客问题调用 \`summarize_customer_acquisition\`。
5. 区分归因收入、优惠成本和获客成本；没有实验或增量数据时不要声称因果提升。`,
    },
    tools: [
      "summarize_campaign_performance",
      "summarize_marketing_by_channel",
      "summarize_coupon_performance",
      "list_underperforming_campaigns",
      "summarize_customer_acquisition",
    ],
    toolset: "marketing-analysis",
  },
} as const;

export type ToolboxCapabilityPackName = keyof typeof toolboxCapabilityPacks;
export type ToolboxCapabilityPack =
  (typeof toolboxCapabilityPacks)[ToolboxCapabilityPackName];
export type ToolboxBusinessCapabilityPack = Extract<
  ToolboxCapabilityPack,
  { kind: "business" }
>;
export type ToolboxToolName = ToolboxCapabilityPack["tools"][number];
export type ToolboxToolScope = ToolboxCapabilityPack["scope"];
export type ToolboxSkillName = ToolboxBusinessCapabilityPack["skill"]["name"];

const toolboxTaxonomy = buildToolboxTaxonomy();

export const toolboxToolNames = toolboxTaxonomy.toolNames;
export const toolboxToolScopes = toolboxTaxonomy.toolScopes;
export const toolboxSkillNames = Object.freeze(
  Object.values(toolboxCapabilityPacks)
    .filter(
      (pack): pack is ToolboxBusinessCapabilityPack => pack.kind === "business",
    )
    .map((pack) => pack.skill.name),
) as readonly ToolboxSkillName[];

const businessPackNames = [
  "ecommerce-sales-analysis",
  "ecommerce-product-analysis",
  "ecommerce-order-operations",
  "ecommerce-fulfillment-operations",
  "finance-analysis",
  "logistics-operations",
  "supply-chain-operations",
  "marketing-analysis",
] as const satisfies readonly ToolboxCapabilityPackName[];

export type ToolboxBusinessCapabilityPackDefinition = {
  catalog: string;
  description: string;
  name: ToolboxSkillName;
  scope: ToolboxToolScope;
  tools: readonly ToolboxToolName[];
  toolset: string;
  workflow: string;
};

export const toolboxBusinessCapabilityPacks = Object.freeze(
  businessPackNames.map((packName) => {
    const pack = toolboxCapabilityPacks[packName];
    return {
      catalog: pack.catalog,
      description: pack.skill.description,
      name: pack.skill.name,
      scope: pack.scope,
      tools: pack.tools,
      toolset: pack.toolset,
      workflow: pack.skill.workflow,
    } satisfies ToolboxBusinessCapabilityPackDefinition;
  }),
) as readonly ToolboxBusinessCapabilityPackDefinition[];

export const toolboxCapabilityProfilePacks = {
  "development-all": ["platform-observability", ...businessPackNames],
  "platform-observability": ["platform-observability"],
  "ecommerce-analyst": [
    "ecommerce-sales-analysis",
    "ecommerce-product-analysis",
    "ecommerce-order-operations",
  ],
  "ecommerce-sales": ["ecommerce-sales-analysis"],
  "ecommerce-product": ["ecommerce-product-analysis"],
  "ecommerce-orders": ["ecommerce-order-operations"],
  "ecommerce-fulfillment": [
    "ecommerce-order-operations",
    "ecommerce-fulfillment-operations",
  ],
  "finance-controller": ["finance-analysis"],
  "logistics-operator": ["logistics-operations"],
  "supply-chain-planner": ["supply-chain-operations"],
  "growth-analyst": ["marketing-analysis"],
  "business-operations": businessPackNames,
} as const satisfies Record<string, readonly ToolboxCapabilityPackName[]>;

export type ToolboxCapabilityProfile =
  keyof typeof toolboxCapabilityProfilePacks;

export type ToolboxCapabilityActivation = {
  enabledSkills: ToolboxSkillName[];
  scopes: ToolboxToolScope[];
  tools: ToolboxToolName[];
};

export const toolboxCapabilityActivations = Object.freeze(
  Object.fromEntries(
    Object.entries(toolboxCapabilityProfilePacks).map(([profile, packs]) => [
      profile,
      resolvePackActivation(packs),
    ]),
  ),
) as Readonly<Record<ToolboxCapabilityProfile, ToolboxCapabilityActivation>>;

export const toolboxCapabilityProfiles = Object.freeze(
  Object.fromEntries(
    Object.entries(toolboxCapabilityActivations).map(
      ([profile, activation]) => [profile, activation.tools],
    ),
  ),
) as unknown as Readonly<
  Record<ToolboxCapabilityProfile, readonly ToolboxToolName[]>
>;

export function resolveToolboxCapabilityProfile(
  capabilityProfile: ToolboxCapabilityProfile,
): ToolboxCapabilityActivation {
  const activation = toolboxCapabilityActivations[capabilityProfile];
  return {
    enabledSkills: [...activation.enabledSkills],
    scopes: [...activation.scopes],
    tools: [...activation.tools],
  };
}

const capabilityProfileNames = Object.keys(toolboxCapabilityProfiles) as [
  keyof typeof toolboxCapabilityProfiles,
  ...(keyof typeof toolboxCapabilityProfiles)[],
];

export const ToolboxCapabilityProfileSchema = z.enum(capabilityProfileNames);

const toolboxToolNameValues = toolboxToolNames as [
  ToolboxToolName,
  ...ToolboxToolName[],
];
const toolboxSkillNameValues = toolboxSkillNames as [
  ToolboxSkillName,
  ...ToolboxSkillName[],
];
const toolboxToolScopeValues = Array.from(
  new Set(Object.values(toolboxToolScopes)),
) as [ToolboxToolScope, ...ToolboxToolScope[]];

export const ToolboxAgentConfigSchema = z.object({
  allowedTools: z.array(z.enum(toolboxToolNameValues)).min(1),
  authorizationToken: z.string().min(1).optional(),
  capabilityProfile: ToolboxCapabilityProfileSchema,
  enabledSkills: z.array(z.enum(toolboxSkillNameValues)),
  scopes: z.array(z.enum(toolboxToolScopeValues)).min(1),
  url: z.string().url(),
});

export type ToolboxAgentConfig = z.infer<typeof ToolboxAgentConfigSchema>;

export function parseToolboxAgentConfig(
  input: Record<string, unknown>,
): ToolboxAgentConfig | undefined {
  const rawUrl = readString(input.TOOLBOX_URL);
  if (!rawUrl) return undefined;

  const authorizationToken = readString(input.TOOLBOX_AUTH_TOKEN);
  const rawCapabilityProfile = readString(input.AGENT_CAPABILITY_PROFILE);
  if (
    authorizationToken &&
    (!rawCapabilityProfile ||
      rawCapabilityProfile === "development-all" ||
      rawCapabilityProfile === "business-operations")
  ) {
    throw new Error(
      "authenticated Toolbox connections require an explicit production role profile; development-all and business-operations are development-only",
    );
  }

  const capabilityProfile = ToolboxCapabilityProfileSchema.parse(
    rawCapabilityProfile ?? "development-all",
  );
  const activation = resolveToolboxCapabilityProfile(capabilityProfile);

  return ToolboxAgentConfigSchema.parse({
    allowedTools: [...activation.tools],
    authorizationToken,
    capabilityProfile,
    enabledSkills: [...activation.enabledSkills],
    scopes: [...activation.scopes],
    url: normalizeToolboxMcpUrl(rawUrl),
  });
}

function buildToolboxTaxonomy() {
  const toolNames: ToolboxToolName[] = [];
  const toolScopes = {} as Record<ToolboxToolName, ToolboxToolScope>;

  for (const pack of Object.values(toolboxCapabilityPacks)) {
    for (const tool of pack.tools) {
      const existingScope = toolScopes[tool];
      if (existingScope && existingScope !== pack.scope) {
        throw new Error(
          `Toolbox Tool ${tool} belongs to conflicting scopes ${existingScope} and ${pack.scope}`,
        );
      }
      if (!existingScope) {
        toolNames.push(tool);
        toolScopes[tool] = pack.scope;
      }
    }
  }

  return {
    toolNames: Object.freeze(toolNames) as readonly ToolboxToolName[],
    toolScopes: Object.freeze(toolScopes),
  };
}

function resolvePackActivation(
  packNames: readonly ToolboxCapabilityPackName[],
): ToolboxCapabilityActivation {
  const tools = new Set<ToolboxToolName>();
  const enabledSkills = new Set<ToolboxSkillName>();
  const scopes = new Set<ToolboxToolScope>();

  for (const packName of packNames) {
    const pack = toolboxCapabilityPacks[packName];
    pack.tools.forEach((tool) => tools.add(tool));
    scopes.add(pack.scope);
    if (pack.kind === "business") enabledSkills.add(pack.skill.name);
  }

  return {
    enabledSkills: [...enabledSkills],
    scopes: [...scopes],
    tools: [...tools],
  };
}

function normalizeToolboxMcpUrl(rawUrl: string) {
  const url = rawUrl.replace(/\/+$/, "");
  return url.endsWith("/mcp") ? url : `${url}/mcp`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const SemanticMetricSchema = z
  .object({
    id: z.string().min(1),
    labels: z.array(z.string().min(1)).min(1),
    resultField: z.string().min(1),
    tools: z.array(z.string().min(1)).min(1),
  })
  .passthrough();

const SemanticDimensionSchema = z
  .object({
    field: z.string().min(1),
    id: z.string().min(1),
    labels: z.array(z.string().min(1)).min(1),
  })
  .passthrough();

export const CertifiedQueryContractSchema = z.object({
  dimensions: z.array(z.string().min(1)).default([]),
  id: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
  metrics: z.array(z.string().min(1)).default([]),
  resultFields: z.array(z.string().min(1)).min(1),
  tool: z.string().min(1),
});

export const BusinessSemanticCatalogSchema = z
  .object({
    databaseSchema: z.string().min(1),
    dimensions: z.array(SemanticDimensionSchema),
    kind: z.literal("business-semantic-catalog"),
    metrics: z.array(SemanticMetricSchema),
    name: z.string().min(1),
    queryContracts: z.array(CertifiedQueryContractSchema).min(1),
    version: z.union([z.string().min(1), z.number().int().nonnegative()]),
  })
  .passthrough()
  .superRefine((catalog, context) => {
    const metricIds = new Set(catalog.metrics.map((metric) => metric.id));
    const dimensionIds = new Set(
      catalog.dimensions.map((dimension) => dimension.id),
    );
    const contractTools = new Set<string>();

    for (const [index, contract] of catalog.queryContracts.entries()) {
      if (contractTools.has(contract.tool)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate certified query contract for tool ${contract.tool}`,
          path: ["queryContracts", index, "tool"],
        });
      }
      contractTools.add(contract.tool);

      for (const metricId of contract.metrics) {
        if (!metricIds.has(metricId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown certified metric ${metricId}`,
            path: ["queryContracts", index, "metrics"],
          });
        }
      }
      for (const dimensionId of contract.dimensions) {
        if (!dimensionIds.has(dimensionId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown certified dimension ${dimensionId}`,
            path: ["queryContracts", index, "dimensions"],
          });
        }
      }
    }
  });
