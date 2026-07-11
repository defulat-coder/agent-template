import { z } from "zod";

export const toolboxToolNames = [
  "list-template-events",
  "get-template-event",
  "list-template-events-in-window",
  "summarize-template-events-by-type",
  "list-agent-runs",
  "get-agent-run-summary",
  "list-agent-run-timeline",
  "list-failed-agent-runs-in-window",
  "summarize-tool-invocations",
  "summarize-ecommerce-sales-by-day",
  "summarize-ecommerce-sales-by-channel",
  "summarize_sales_by_region",
  "summarize_sales_by_customer_segment",
  "list-ecommerce-top-products",
  "summarize_merchandise_by_category",
  "list-ecommerce-orders-in-window",
  "get-ecommerce-order-detail",
  "list-ecommerce-fulfillment-exceptions",
] as const;

export type ToolboxToolName = (typeof toolboxToolNames)[number];

export const toolboxToolScopes = {
  "list-template-events": "agent-template:observe",
  "get-template-event": "agent-template:observe",
  "list-template-events-in-window": "agent-template:observe",
  "summarize-template-events-by-type": "agent-template:observe",
  "list-agent-runs": "agent-template:observe",
  "get-agent-run-summary": "agent-template:observe",
  "list-agent-run-timeline": "agent-template:observe",
  "list-failed-agent-runs-in-window": "agent-template:observe",
  "summarize-tool-invocations": "agent-template:observe",
  "summarize-ecommerce-sales-by-day": "ecommerce:read",
  "summarize-ecommerce-sales-by-channel": "ecommerce:read",
  summarize_sales_by_region: "ecommerce:read",
  summarize_sales_by_customer_segment: "ecommerce:read",
  "list-ecommerce-top-products": "ecommerce:read",
  summarize_merchandise_by_category: "ecommerce:read",
  "list-ecommerce-orders-in-window": "ecommerce:read",
  "get-ecommerce-order-detail": "ecommerce:read",
  "list-ecommerce-fulfillment-exceptions": "ecommerce:read",
} as const satisfies Record<ToolboxToolName, ToolboxToolScope>;

export type ToolboxToolScope = "agent-template:observe" | "ecommerce:read";

export const toolboxCapabilityProfiles = {
  "development-all": toolboxToolNames,
  "platform-observability": toolboxToolNames.slice(0, 9),
  "ecommerce-analyst": [
    "summarize-ecommerce-sales-by-day",
    "summarize-ecommerce-sales-by-channel",
    "summarize_sales_by_region",
    "summarize_sales_by_customer_segment",
    "list-ecommerce-top-products",
    "summarize_merchandise_by_category",
    "list-ecommerce-orders-in-window",
    "get-ecommerce-order-detail",
  ],
  "ecommerce-sales": [
    "summarize-ecommerce-sales-by-day",
    "summarize-ecommerce-sales-by-channel",
    "summarize_sales_by_region",
    "summarize_sales_by_customer_segment",
  ],
  "ecommerce-product": [
    "list-ecommerce-top-products",
    "summarize_merchandise_by_category",
  ],
  "ecommerce-orders": [
    "list-ecommerce-orders-in-window",
    "get-ecommerce-order-detail",
  ],
  "ecommerce-fulfillment": [
    "list-ecommerce-orders-in-window",
    "get-ecommerce-order-detail",
    "list-ecommerce-fulfillment-exceptions",
  ],
} as const satisfies Record<string, readonly ToolboxToolName[]>;

const capabilityProfileNames = Object.keys(toolboxCapabilityProfiles) as [
  keyof typeof toolboxCapabilityProfiles,
  ...(keyof typeof toolboxCapabilityProfiles)[],
];

export const ToolboxCapabilityProfileSchema = z.enum(capabilityProfileNames);

export const ToolboxAgentConfigSchema = z.object({
  allowedTools: z.array(z.enum(toolboxToolNames)).min(1),
  authorizationToken: z.string().min(1).optional(),
  capabilityProfile: ToolboxCapabilityProfileSchema,
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
    (!rawCapabilityProfile || rawCapabilityProfile === "development-all")
  ) {
    throw new Error(
      "authenticated Toolbox connections require an explicit profile other than development-all",
    );
  }

  const capabilityProfile = ToolboxCapabilityProfileSchema.parse(
    rawCapabilityProfile ?? "development-all",
  );

  return ToolboxAgentConfigSchema.parse({
    allowedTools: [...toolboxCapabilityProfiles[capabilityProfile]],
    authorizationToken,
    capabilityProfile,
    url: normalizeToolboxMcpUrl(rawUrl),
  });
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
