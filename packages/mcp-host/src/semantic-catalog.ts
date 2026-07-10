import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import type { McpHostToolCallResult } from "./index.js";

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

export type BusinessSemanticCatalog = z.infer<
  typeof BusinessSemanticCatalogSchema
>;

export type SemanticCatalogSource = {
  path: string;
  serverId: string;
};

export type CertifiedQueryContract = z.infer<
  typeof CertifiedQueryContractSchema
> & {
  catalogName: string;
  catalogVersion: string | number;
};

export function loadCertifiedQueryContracts(
  sources: Record<string, SemanticCatalogSource>,
) {
  const contracts = new Map<string, CertifiedQueryContract>();

  for (const source of Object.values(sources)) {
    const catalog = BusinessSemanticCatalogSchema.parse(
      parse(readFileSync(source.path, "utf8")),
    );
    for (const contract of catalog.queryContracts) {
      const key = contractKey(source.serverId, contract.tool);
      if (contracts.has(key)) {
        throw new Error(
          `Duplicate certified query contract for ${source.serverId}/${contract.tool}`,
        );
      }
      contracts.set(key, {
        ...contract,
        catalogName: catalog.name,
        catalogVersion: catalog.version,
      });
    }
  }

  return contracts;
}

export function annotateCertifiedQueryResult(
  result: McpHostToolCallResult,
  input: {
    arguments: Record<string, unknown>;
    contract?: CertifiedQueryContract;
    executedAt: string;
    serverId: string;
    toolName: string;
  },
): McpHostToolCallResult {
  if (!input.contract) return result;

  const limit =
    typeof input.arguments.limit === "number"
      ? input.arguments.limit
      : undefined;
  const offset =
    typeof input.arguments.offset === "number" ? input.arguments.offset : 0;
  const hasMore = limit ? result.content.length > limit : false;
  const visibleResult =
    limit && hasMore
      ? { ...result, content: result.content.slice(0, limit) }
      : result;
  const returnedCount = visibleResult.content.length;
  const page = limit
    ? {
        hasMore,
        limit,
        ...(hasMore ? { nextOffset: offset + returnedCount } : {}),
        offset,
        returnedCount,
      }
    : { returnedCount };
  const emptyResult =
    returnedCount === 0
      ? {
          isEmpty: true,
          reason: "当前参数范围内没有符合认证业务口径的数据。",
          suggestions: createEmptyResultSuggestions(input.arguments),
        }
      : undefined;

  return {
    ...visibleResult,
    structuredContent: {
      ...(visibleResult.structuredContent ?? {}),
      certifiedQuery: {
        catalog: {
          name: input.contract.catalogName,
          version: input.contract.catalogVersion,
        },
        contract: {
          dimensions: input.contract.dimensions,
          id: input.contract.id,
          limitations: input.contract.limitations,
          metrics: input.contract.metrics,
          resultFields: input.contract.resultFields,
        },
        dataFreshness: {
          status: "not-declared",
          note: "数据源未提供可验证的刷新水位；executedAt 仅表示查询执行时间。",
        },
        execution: { executedAt: input.executedAt },
        ...(emptyResult ? { emptyResult } : {}),
        kind: "certified-query-result",
        page,
        request: { arguments: input.arguments },
        tool: { name: input.toolName, serverId: input.serverId },
      },
    },
  };
}

function createEmptyResultSuggestions(args: Record<string, unknown>) {
  const suggestions = ["确认当前 Agent capability profile 与数据权限范围。"];
  if (typeof args.from === "string" || typeof args.to === "string") {
    suggestions.unshift(
      "检查 UTC [from, to) 边界，或在不超过 31 天的前提下扩大时间窗。",
    );
  }
  if (typeof args.orderNumber === "string") {
    suggestions.unshift("核对完整订单号，避免空格、截断或环境不一致。");
  }
  if (typeof args.offset === "number" && args.offset > 0) {
    suggestions.unshift("将 offset 调小或回到首页确认是否已超过末页。");
  }
  return suggestions;
}

export function contractKey(serverId: string, toolName: string) {
  return `${serverId}\u0000${toolName}`;
}
