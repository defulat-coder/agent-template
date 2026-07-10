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

  return {
    ...result,
    structuredContent: {
      ...(result.structuredContent ?? {}),
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
        kind: "certified-query-result",
        request: { arguments: input.arguments },
        tool: { name: input.toolName, serverId: input.serverId },
      },
    },
  };
}

export function contractKey(serverId: string, toolName: string) {
  return `${serverId}\u0000${toolName}`;
}
