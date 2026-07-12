import { z } from "zod";

const SemanticValueSchema = z.object({
  labels: z.array(z.string().min(1)).min(1),
  value: z.union([z.string(), z.number()]),
});

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
    fixtureValues: z.array(SemanticValueSchema).optional(),
    id: z.string().min(1),
    labels: z.array(z.string().min(1)).min(1),
    values: z.array(SemanticValueSchema).optional(),
  })
  .passthrough();

const QueryParameterSchema = z.object({
  default: z.union([z.string(), z.number()]).optional(),
  name: z.string().min(1),
  required: z.boolean().optional(),
});

export const CertifiedQueryContractSchema = z
  .object({
    dimensions: z.array(z.string()).default([]),
    id: z.string().min(1),
    limitations: z.array(z.string().min(1)).min(1),
    metrics: z.array(z.string()).default([]),
    parameters: z.array(QueryParameterSchema).default([]),
    resultFields: z.array(z.string().min(1)).min(1),
    tool: z.string().min(1),
  })
  .passthrough();

const QuestionPatternSchema = z
  .object({
    contract: z.string().min(1),
    examples: z.array(z.string().min(1)).default([]),
    id: z.string().min(1),
    required: z.array(z.string().min(1)).default([]),
    tool: z.string().min(1),
  })
  .passthrough();

export const BusinessSemanticCatalogSchema = z
  .object({
    ambiguities: z
      .array(
        z.object({
          action: z.literal("clarify"),
          reason: z.string().min(1),
          term: z.string().min(1),
        }),
      )
      .default([]),
    databaseSchema: z.string().min(1),
    dimensions: z.array(SemanticDimensionSchema),
    kind: z.literal("business-semantic-catalog"),
    metrics: z.array(SemanticMetricSchema),
    name: z.string().min(1),
    queryContracts: z.array(CertifiedQueryContractSchema).min(1),
    questionPatterns: z.array(QuestionPatternSchema).min(1),
    timeZone: z.literal("UTC").default("UTC"),
    version: z.union([z.string().min(1), z.number().int().nonnegative()]),
  })
  .passthrough();

export type BusinessSemanticCatalog = z.infer<
  typeof BusinessSemanticCatalogSchema
>;
export type CertifiedQueryContract = z.infer<
  typeof CertifiedQueryContractSchema
>;

type Catalog = BusinessSemanticCatalog;
type QueryContract = CertifiedQueryContract;

export const SemanticQueryProposalSchema = z
  .object({
    catalog: z.string().min(1).optional(),
    intent: z.string().min(1).optional(),
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
    terms: z.array(z.string().min(1)).optional(),
    timeExpression: z.string().min(1).optional(),
  })
  .strict();

export const SemanticQueryRequestSchema = z
  .object({
    proposal: SemanticQueryProposalSchema,
    question: z.string().trim().min(1),
  })
  .strict();

export type SemanticQueryProposal = z.infer<typeof SemanticQueryProposalSchema>;
export type SemanticQueryRequest = z.infer<typeof SemanticQueryRequestSchema>;

export type SemanticQueryClarification = {
  candidates?: string[];
  code:
    | "ambiguous_term"
    | "catalog_required"
    | "intent_required"
    | "missing_entity_key"
    | "missing_parameter"
    | "multiple_dimension_values"
    | "missing_time_window";
  message: string;
  queryId: string;
  term?: string;
  type: "clarification";
};

export type SemanticQueryUnsupported = {
  code:
    | "capability_not_allowed"
    | "invalid_catalog"
    | "invalid_intent"
    | "invalid_pagination"
    | "invalid_terms"
    | "filter_not_supported"
    | "unsupported_time_window";
  message: string;
  queryId: string;
  type: "unsupported";
};

export type SemanticQueryPlan = {
  arguments: Readonly<Record<string, string | number>>;
  catalog: string;
  catalogVersion: string | number;
  contract: string;
  intent: string;
  terms: string[];
  timeWindow?: { from: string; timezone: "UTC"; to: string };
  tool: string;
};

export type SemanticQueryResult = {
  data: ReadonlyArray<Readonly<Record<string, unknown>>>;
  executedAt: string;
  limitations: string[];
  plan: SemanticQueryPlan;
  planHash: string;
  queryId: string;
  rowCount: number;
  truncated: boolean;
  type: "result";
};

export type SemanticQueryResponse =
  | SemanticQueryClarification
  | SemanticQueryResult
  | SemanticQueryUnsupported;

export type ExecuteSemanticTool = (
  tool: string,
  arguments_: Readonly<Record<string, string | number>>,
  options?: { signal?: AbortSignal | undefined },
) => Promise<unknown>;

export type SemanticQueryEngineOptions = {
  allowedTools: readonly string[];
  catalogs: readonly unknown[];
  executeTool: ExecuteSemanticTool;
  now: Date | string | (() => Date | string);
};

export class SemanticQueryExecutionError extends Error {
  override readonly name = "SemanticQueryExecutionError";
}

export function createSemanticQueryEngine(options: SemanticQueryEngineOptions) {
  const catalogs = parseCatalogs(options.catalogs);
  const allowedTools = new Set(options.allowedTools);

  return {
    async query(
      request: SemanticQueryRequest,
      queryOptions?: { signal?: AbortSignal | undefined },
    ): Promise<SemanticQueryResponse> {
      queryOptions?.signal?.throwIfAborted();
      const queryRequest = SemanticQueryRequestSchema.parse(request);
      const executedAt = readNow(options.now);
      const queryId = `sq_${globalThis.crypto.randomUUID()}`;
      const requestedCatalog = queryRequest.proposal.catalog;
      if (
        requestedCatalog &&
        catalogs.some(({ name }) => name === requestedCatalog) &&
        !catalogs
          .find(({ name }) => name === requestedCatalog)
          ?.queryContracts.some(({ tool }) => allowedTools.has(tool))
      ) {
        return {
          code: "capability_not_allowed",
          message: "The selected semantic catalog has no allowed Tool surface.",
          queryId,
          type: "unsupported",
        };
      }
      const visibleCatalogs = catalogs.filter((catalog) =>
        catalog.queryContracts.some(({ tool }) => allowedTools.has(tool)),
      );
      const inferredCatalogs = requestedCatalog
        ? visibleCatalogs
        : visibleCatalogs.filter(
            (catalog) =>
              findPatternCandidates(
                catalog,
                queryRequest.proposal,
                allowedTools,
              ).length > 0,
          );
      const catalogPool = inferredCatalogs.length
        ? inferredCatalogs
        : visibleCatalogs;
      const selectedCatalogName =
        requestedCatalog ??
        (catalogPool.length === 1 ? catalogPool[0]?.name : undefined);
      const catalogSelection = selectCatalog(
        catalogPool,
        selectedCatalogName,
        queryId,
      );
      if (catalogSelection.type !== "selected")
        return catalogSelection.response;
      const catalog = catalogSelection.catalog;

      const patternCandidates = findPatternCandidates(
        catalog,
        queryRequest.proposal,
        allowedTools,
      );
      const proposedPattern =
        patternCandidates.length === 1 ? patternCandidates[0] : undefined;
      const proposedContract = catalog.queryContracts.find(
        (candidate) => candidate.id === proposedPattern?.contract,
      );
      const ambiguity = catalog.ambiguities.find(
        ({ term }) =>
          queryRequest.question.includes(term) &&
          !hasMoreSpecificPatternMatch(
            queryRequest.question,
            term,
            proposedPattern?.examples ?? [],
          ) &&
          !hasSpecificCertifiedTermMatch(
            catalog,
            proposedContract,
            queryRequest.question,
            term,
          ),
      );
      if (ambiguity) {
        return {
          code: "ambiguous_term",
          message: ambiguity.reason,
          queryId,
          term: ambiguity.term,
          type: "clarification",
        };
      }

      if (!queryRequest.proposal.intent && !proposedPattern) {
        return {
          candidates: patternCandidates.map(({ id }) => id),
          code: "intent_required",
          message: "A unique canonical question pattern is required.",
          queryId,
          type: "clarification",
        };
      }
      const pattern = proposedPattern;
      const contract = proposedContract;
      if (!pattern || !contract || pattern.tool !== contract.tool) {
        return {
          code: "invalid_intent",
          message: `Unknown or inconsistent semantic intent ${queryRequest.proposal.intent}.`,
          queryId,
          type: "unsupported",
        };
      }
      if (!allowedTools.has(contract.tool)) {
        return {
          code: "capability_not_allowed",
          message:
            "The selected semantic query is outside the allowed Tool surface.",
          queryId,
          type: "unsupported",
        };
      }

      const terms = [...new Set(queryRequest.proposal.terms ?? [])];
      const knownTerms = new Set([
        ...catalog.metrics.map(({ id }) => id),
        ...catalog.dimensions.map(({ id }) => id),
      ]);
      const contractTerms = new Set([
        ...contract.metrics,
        ...contract.dimensions,
      ]);
      if (
        terms.some((term) => !knownTerms.has(term) || !contractTerms.has(term))
      ) {
        return {
          code: "invalid_terms",
          message:
            "The proposed terms are not certified by the selected contract.",
          queryId,
          type: "unsupported",
        };
      }

      const arguments_: Record<string, string | number> = {};
      let timeWindow: SemanticQueryPlan["timeWindow"];
      if (pattern.required.includes("time_window")) {
        const timeExpression =
          queryRequest.proposal.timeExpression ??
          extractTimeExpression(queryRequest.question);
        if (!timeExpression) {
          return {
            code: "missing_time_window",
            message:
              "This semantic query requires an explicit UTC time window.",
            queryId,
            type: "clarification",
          };
        }
        const parsedTime = parseTimeWindow(timeExpression, executedAt);
        if (!parsedTime) {
          return {
            code: "unsupported_time_window",
            message: `Unsupported or invalid time expression: ${timeExpression}`,
            queryId,
            type: "unsupported",
          };
        }
        timeWindow = { ...parsedTime, timezone: "UTC" };
        arguments_.from = parsedTime.from;
        arguments_.to = parsedTime.to;
      }

      const pagination = resolvePagination(
        contract,
        pattern.required,
        queryRequest.proposal,
        queryRequest.question,
      );
      if (pagination.type === "invalid") {
        return {
          code: "invalid_pagination",
          message: pagination.message,
          queryId,
          type: "unsupported",
        };
      }
      Object.assign(arguments_, pagination.arguments);

      const entityKeys = resolveEntityKeys(
        pattern.required,
        contract,
        queryRequest.question,
      );
      if (entityKeys.type === "missing") {
        return {
          code: "missing_entity_key",
          message: entityKeys.message,
          queryId,
          type: "clarification",
        };
      }
      Object.assign(arguments_, entityKeys.arguments);

      const dimensionFilters = extractDimensionFilters(
        catalog,
        contract,
        queryRequest.question,
      );
      if (dimensionFilters.type === "ambiguous") {
        return {
          candidates: dimensionFilters.values.map(String),
          code: "multiple_dimension_values",
          message: `Multiple values were selected for ${dimensionFilters.dimensionId}.`,
          queryId,
          type: "clarification",
        };
      }
      for (const filter of dimensionFilters.filters) {
        const parameter = findDimensionParameter(contract, filter.dimension);
        if (!parameter) {
          return {
            code: "filter_not_supported",
            message: `Contract ${contract.id} cannot push down the ${filter.dimension.id} filter.`,
            queryId,
            type: "unsupported",
          };
        }
        arguments_[parameter.name] = filter.value;
      }
      for (const parameter of contract.parameters) {
        if (arguments_[parameter.name] !== undefined) continue;
        if (parameter.default !== undefined) {
          arguments_[parameter.name] = parameter.default;
          continue;
        }
        if (parameter.required) {
          return {
            code: "missing_parameter",
            message: `Required contract parameter ${parameter.name} is missing.`,
            queryId,
            type: "clarification",
          };
        }
      }

      const plan: SemanticQueryPlan = {
        arguments: arguments_,
        catalog: catalog.name,
        catalogVersion: catalog.version,
        contract: contract.id,
        intent: pattern.id,
        terms,
        ...(timeWindow ? { timeWindow } : {}),
        tool: contract.tool,
      };
      const planHash = await hashPlan(plan);
      const rawResult = await options.executeTool(contract.tool, arguments_, {
        signal: queryOptions?.signal,
      });
      const data = validateAndProjectRows(rawResult, contract);
      return {
        data,
        executedAt: executedAt.toISOString(),
        limitations: [...contract.limitations],
        plan,
        planHash,
        queryId,
        rowCount: data.length,
        truncated: isTruncated(data, arguments_),
        type: "result",
      };
    },
  };
}

function parseCatalogs(rawCatalogs: readonly unknown[]): Catalog[] {
  const catalogs = rawCatalogs.map((catalog) =>
    BusinessSemanticCatalogSchema.parse(catalog),
  );
  const names = new Set<string>();
  for (const catalog of catalogs) {
    if (names.has(catalog.name)) {
      throw new Error(`Duplicate semantic catalog ${catalog.name}`);
    }
    names.add(catalog.name);
  }
  return catalogs;
}

function selectCatalog(
  catalogs: Catalog[],
  requestedName: string | undefined,
  queryId: string,
) {
  if (!requestedName) {
    return {
      response: {
        candidates: catalogs.map(({ name }) => name),
        code: "catalog_required",
        message: "A canonical semantic catalog is required.",
        queryId,
        type: "clarification",
      } satisfies SemanticQueryClarification,
      type: "response" as const,
    };
  }
  const catalog = catalogs.find(({ name }) => name === requestedName);
  if (!catalog) {
    return {
      response: {
        code: "invalid_catalog",
        message: `Unknown semantic catalog ${requestedName}.`,
        queryId,
        type: "unsupported",
      } satisfies SemanticQueryUnsupported,
      type: "response" as const,
    };
  }
  return { catalog, type: "selected" as const };
}

function findPatternCandidates(
  catalog: Catalog,
  proposal: SemanticQueryProposal,
  allowedTools: ReadonlySet<string>,
) {
  if (proposal.intent) {
    return catalog.questionPatterns.filter(
      (pattern) => pattern.id === proposal.intent,
    );
  }
  const terms = [...new Set(proposal.terms ?? [])];
  if (!terms.length) return [];
  return catalog.questionPatterns.filter((pattern) => {
    if (!allowedTools.has(pattern.tool)) return false;
    const contract = catalog.queryContracts.find(
      ({ id }) => id === pattern.contract,
    );
    if (!contract || contract.tool !== pattern.tool) return false;
    const contractTerms = new Set([
      ...contract.metrics,
      ...contract.dimensions,
    ]);
    return terms.every((term) => contractTerms.has(term));
  });
}

function readNow(now: SemanticQueryEngineOptions["now"]): Date {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error("Invalid semantic query clock");
  return date;
}

function parseTimeWindow(expression: string, now: Date) {
  const normalized = expression.trim();
  const day = startOfUtcDay(now);
  let from: Date | undefined;
  let to: Date | undefined;

  const range = normalized.match(/^(.+?)\s*(?:到|至|~|—)\s*(.+)$/u);
  if (range?.[1] && range[2]) {
    from = parseUtcDate(range[1]);
    const inclusiveEnd = parseUtcDate(range[2]);
    if (inclusiveEnd) to = addUtcDays(inclusiveEnd, 1);
  } else {
    const explicitDate = parseUtcDate(normalized);
    if (explicitDate) {
      from = explicitDate;
      to = addUtcDays(explicitDate, 1);
    } else if (normalized === "今天") {
      from = day;
      to = now;
    } else if (normalized === "昨天") {
      from = addUtcDays(day, -1);
      to = day;
    } else if (/^(?:近|最近)\d+天$/u.test(normalized)) {
      const days = Number(normalized.match(/\d+/u)?.[0]);
      if (Number.isInteger(days) && days > 0) {
        from = new Date(now.getTime() - days * UTC_DAY_MS);
        to = now;
      }
    } else if (normalized === "本周") {
      from = startOfUtcWeek(now);
      to = now;
    } else if (normalized === "上周") {
      to = startOfUtcWeek(now);
      from = addUtcDays(to, -7);
    } else if (normalized === "本月") {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      to = now;
    } else if (normalized === "上月") {
      to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 1, 1));
    }
  }

  if (!from || !to) return undefined;
  const duration = to.getTime() - from.getTime();
  if (duration <= 0 || duration > 31 * UTC_DAY_MS) return undefined;
  return { from: from.toISOString(), to: to.toISOString() };
}

function extractTimeExpression(question: string) {
  const patterns = [
    /\d{4}(?:-|年)\d{1,2}(?:-|月)\d{1,2}日?\s*(?:到|至|~|—)\s*\d{4}(?:-|年)\d{1,2}(?:-|月)\d{1,2}日?/u,
    /\d{4}(?:-|年)\d{1,2}(?:-|月)\d{1,2}日?/u,
    /(?:最近|近)\d+天/u,
    /今天|昨天|本周|上周|本月|上月/u,
  ];
  for (const pattern of patterns) {
    const matched = question.match(pattern)?.[0];
    if (matched) return matched;
  }
  return undefined;
}

function extractDimensionFilters(
  catalog: Catalog,
  contract: QueryContract,
  question: string,
) {
  const filters: Array<{
    dimension: Catalog["dimensions"][number];
    value: string | number;
  }> = [];
  for (const dimension of catalog.dimensions) {
    if (!contract.dimensions.includes(dimension.id)) continue;
    const values = [
      ...(dimension.values ?? []),
      ...(dimension.fixtureValues ?? []),
    ];
    const matched = values.filter((candidate) =>
      candidate.labels.some((label) => question.includes(label)),
    );
    const uniqueValues = [...new Set(matched.map(({ value }) => value))];
    if (uniqueValues.length > 1) {
      return {
        dimensionId: dimension.id,
        type: "ambiguous" as const,
        values: uniqueValues,
      };
    }
    const value = uniqueValues[0];
    if (value !== undefined) filters.push({ dimension, value });
  }
  return { filters, type: "filters" as const };
}

function resolvePagination(
  contract: QueryContract,
  required: string[],
  proposal: SemanticQueryProposal,
  question: string,
) {
  const arguments_: Record<string, number> = {};
  const questionPagination = parseQuestionPagination(question);
  const limitParameter = contract.parameters.find(
    ({ name }) => name === "limit",
  );
  const usesLimit = required.includes("limit") || limitParameter !== undefined;
  if (usesLimit) {
    const limit =
      proposal.limit ??
      questionPagination.limit ??
      limitParameter?.default ??
      50;
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return {
        message: "limit must be an integer between 1 and 100",
        type: "invalid" as const,
      };
    }
    arguments_[limitParameter?.name ?? "limit"] = limit;
  } else if (proposal.limit !== undefined) {
    return {
      message: `Contract ${contract.id} does not support limit`,
      type: "invalid" as const,
    };
  }

  const offsetParameter = contract.parameters.find(
    ({ name }) => name === "offset",
  );
  const usesOffset =
    required.includes("offset") ||
    offsetParameter !== undefined ||
    proposal.offset !== undefined ||
    questionPagination.page !== undefined;
  if (usesOffset) {
    if (!usesLimit) {
      return {
        message: `Contract ${contract.id} cannot use offset without limit`,
        type: "invalid" as const,
      };
    }
    const resolvedLimit = arguments_[limitParameter?.name ?? "limit"];
    const pageOffset =
      questionPagination.page !== undefined && resolvedLimit !== undefined
        ? (questionPagination.page - 1) * resolvedLimit
        : undefined;
    const offset =
      proposal.offset ?? pageOffset ?? offsetParameter?.default ?? 0;
    if (
      typeof offset !== "number" ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10_000
    ) {
      return {
        message: "offset must be an integer between 0 and 10000",
        type: "invalid" as const,
      };
    }
    arguments_[offsetParameter?.name ?? "offset"] = offset;
  }
  return { arguments: arguments_, type: "arguments" as const };
}

function parseQuestionPagination(question: string) {
  const pageSizeToken =
    question.match(/每页\s*([\d一二两三四五六七八九十百]+)\s*条/u)?.[1] ??
    question.match(/前\s*([\d一二两三四五六七八九十百]+)\s*条/u)?.[1];
  const pageToken = question.match(
    /第\s*([\d一二两三四五六七八九十百]+)\s*页/u,
  )?.[1];
  return {
    limit: pageSizeToken ? parseChineseInteger(pageSizeToken) : undefined,
    page: pageToken ? parseChineseInteger(pageToken) : undefined,
  };
}

function parseChineseInteger(value: string): number | undefined {
  if (/^\d+$/u.test(value)) return Number(value);
  const digits: Record<string, number> = {
    一: 1,
    两: 2,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (value === "十") return 10;
  const hundredParts = value.split("百");
  if (hundredParts.length === 2) {
    const hundreds = digits[hundredParts[0] ?? ""];
    const rest = hundredParts[1] ?? "";
    if (!hundreds) return undefined;
    return hundreds * 100 + (rest ? (parseChineseInteger(rest) ?? 0) : 0);
  }
  const tenParts = value.split("十");
  if (tenParts.length === 2) {
    const tens = tenParts[0] ? digits[tenParts[0]] : 1;
    const ones = tenParts[1] ? digits[tenParts[1]] : 0;
    if (!tens || ones === undefined) return undefined;
    return tens * 10 + ones;
  }
  return digits[value];
}

function resolveEntityKeys(
  required: string[],
  contract: QueryContract,
  question: string,
) {
  const arguments_: Record<string, string> = {};
  const entityDefinitions = [
    {
      parameterName: "orderNumber",
      pattern: /\bEC\d{11}\b/u,
      slot: "order_number",
    },
    {
      parameterName: "shipmentNumber",
      pattern: /\bSHP-\d{8}-\d{4}\b/u,
      slot: "shipment_number",
    },
  ] as const;

  for (const definition of entityDefinitions) {
    if (!required.includes(definition.slot)) continue;
    const value = question.match(definition.pattern)?.[0];
    if (!value) {
      return {
        message: `Question pattern ${contract.id} requires ${definition.slot}.`,
        type: "missing" as const,
      };
    }
    const parameter = contract.parameters.find(
      ({ name }) => name === definition.parameterName,
    );
    arguments_[parameter?.name ?? definition.parameterName] = value;
  }
  return { arguments: arguments_, type: "arguments" as const };
}

function findDimensionParameter(
  contract: QueryContract,
  dimension: Catalog["dimensions"][number],
) {
  const fieldName = dimension.field.split(".").at(-1);
  const camelCaseId = dimension.id.replace(
    /_([a-z])/gu,
    (_match, letter: string) => letter.toUpperCase(),
  );
  return contract.parameters.find(
    ({ name }) =>
      name === dimension.id || name === camelCaseId || name === fieldName,
  );
}

const UTC_DAY_MS = 24 * 60 * 60 * 1_000;

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function startOfUtcWeek(value: Date) {
  const day = startOfUtcDay(value);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return addUtcDays(day, -daysSinceMonday);
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * UTC_DAY_MS);
}

function parseUtcDate(value: string) {
  const normalized = value.trim();
  const match =
    normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u) ??
    normalized.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/u);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== date
  ) {
    return undefined;
  }
  return parsed;
}

function hasMoreSpecificPatternMatch(
  question: string,
  ambiguousTerm: string,
  examples: string[],
) {
  return examples.some(
    (example) =>
      example.includes(ambiguousTerm) &&
      longestCommonSubstringLength(question, example) > ambiguousTerm.length,
  );
}

function hasSpecificCertifiedTermMatch(
  catalog: Catalog,
  contract: QueryContract | undefined,
  question: string,
  ambiguousTerm: string,
) {
  if (!contract) return false;
  const certifiedTerms = new Set([...contract.metrics, ...contract.dimensions]);
  const labels = [...catalog.metrics, ...catalog.dimensions]
    .filter(({ id }) => certifiedTerms.has(id))
    .flatMap(({ labels: entryLabels }) => entryLabels);
  return labels.some(
    (label) => label.length > ambiguousTerm.length && question.includes(label),
  );
}

function longestCommonSubstringLength(left: string, right: string) {
  const previous = new Array<number>(right.length + 1).fill(0);
  let longest = 0;
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = 0;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex] ?? 0;
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        previous[rightIndex] = diagonal + 1;
        longest = Math.max(longest, previous[rightIndex] ?? 0);
      } else {
        previous[rightIndex] = 0;
      }
      diagonal = above;
    }
  }
  return longest;
}

async function hashPlan(plan: SemanticQueryPlan): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(plan));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateAndProjectRows(
  rawResult: unknown,
  contract: QueryContract,
): Array<Record<string, unknown>> {
  if (!Array.isArray(rawResult)) {
    throw new SemanticQueryExecutionError(
      `Tool ${contract.tool} returned a non-array result`,
    );
  }
  return rawResult.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new SemanticQueryExecutionError(
        `Tool ${contract.tool} returned a non-object row at index ${index}`,
      );
    }
    const record = row as Record<string, unknown>;
    const projected: Record<string, unknown> = {};
    for (const field of contract.resultFields) {
      if (!(field in record)) {
        throw new SemanticQueryExecutionError(
          `Tool ${contract.tool} row ${index} is missing certified result field ${field}`,
        );
      }
      projected[field] = record[field];
    }
    return projected;
  });
}

function isTruncated(
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
  arguments_: Readonly<Record<string, string | number>>,
) {
  const limit = arguments_.limit;
  const offset = arguments_.offset ?? 0;
  const totalCount = rows.find(
    (row) => typeof row.totalCount === "number",
  )?.totalCount;
  if (typeof totalCount === "number") {
    return totalCount > Number(offset) + rows.length;
  }
  return typeof limit === "number" && rows.length >= limit;
}
