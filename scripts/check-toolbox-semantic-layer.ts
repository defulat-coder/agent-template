import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";
import {
  BusinessSemanticCatalogSchema,
  toolboxBusinessCapabilityPacks,
  toolboxToolNames,
  toolboxToolScopes,
} from "@agent-template/toolbox-config";

type ToolboxEntry = Record<string, unknown>;
type ToolboxParameter = {
  description?: unknown;
  maxValue?: unknown;
  name?: unknown;
};

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const toolboxConfigPath = join(repositoryRoot, "apps/toolbox/tools.yaml");
const semanticRoot = join(repositoryRoot, "apps/toolbox/semantic");
const errors: string[] = [];

const legacyToolNames = new Set([
  "get-agent-run-summary",
  "get-ecommerce-order-detail",
  "get-template-event",
  "list-agent-run-timeline",
  "list-agent-runs",
  "list-ecommerce-fulfillment-exceptions",
  "list-ecommerce-orders-in-window",
  "list-ecommerce-top-products",
  "list-failed-agent-runs-in-window",
  "list-template-events",
  "list-template-events-in-window",
  "summarize-ecommerce-sales-by-channel",
  "summarize-ecommerce-sales-by-day",
  "summarize-template-events-by-type",
  "summarize-tool-invocations",
]);
const legacyToolsets = new Set(["agent_template_read_model"]);
const agentRunRecordTools = new Set([
  "list-agent-runs",
  "get-agent-run-summary",
  "list-agent-run-timeline",
  "list-failed-agent-runs-in-window",
  "summarize-tool-invocations",
]);
const semanticDescriptionRequirements: Record<string, string[]> = {
  "get-ecommerce-order-detail": ["orderNumber", "合成业务属性"],
  "list-ecommerce-fulfillment-exceptions": [
    "status = PAID",
    "fulfilledAt 为空",
    "hoursWaiting",
  ],
  "list-ecommerce-orders-in-window": [
    "placedAt",
    "合成客户编码",
    "不返回直接联系方式",
  ],
  "list-ecommerce-top-products": [
    "grossMerchandiseSales",
    "netMerchandiseSales",
    "不包含运费",
  ],
  "summarize-ecommerce-sales-by-channel": [
    "PAID、FULFILLED、REFUNDED",
    "netSales",
    "averageOrderValue",
  ],
  "summarize-ecommerce-sales-by-day": [
    "PAID、FULFILLED、REFUNDED",
    "grossSales",
    "netSales = grossSales - refundAmount",
  ],
  summarize_merchandise_by_category: [
    "grossMerchandiseSales",
    "netMerchandiseSales",
    "不包含运费",
  ],
  summarize_sales_by_customer_segment: [
    "NEW、ACTIVE、VIP、AT_RISK",
    "grossSales",
    "averageOrderValue",
  ],
  summarize_sales_by_region: [
    "PAID、FULFILLED、REFUNDED",
    "customer.region",
    "averageOrderValue",
  ],
};

const entries = readYamlDocuments(toolboxConfigPath, "Toolbox config");
const sources = entries.filter((entry) => entry.kind === "source");
const tools = entries.filter((entry) => entry.kind === "tool");
const toolsets = entries.filter((entry) => entry.kind === "toolset");
const toolNames = new Set(tools.map((tool) => readName(tool, "tool")));
const toolByName = new Map(
  tools.map((tool) => [readName(tool, "tool"), tool] as const),
);
const toolsetByName = new Map(
  toolsets.map((toolset) => [readName(toolset, "toolset"), toolset] as const),
);
const businessToolNames = new Set<string>(
  toolboxBusinessCapabilityPacks.flatMap((pack) => [...pack.tools]),
);
const pageableBusinessTools = new Set<string>(
  [...businessToolNames].filter((name) => /^list[-_]/.test(name)),
);

if (toolNames.size !== tools.length) {
  errors.push("Toolbox config contains duplicate Tool names");
}
if (toolsetByName.size !== toolsets.length) {
  errors.push("Toolbox config contains duplicate Toolset names");
}
if (tools.length > 40) {
  errors.push(
    `Toolbox server exposes ${tools.length} tools; keep the governed surface at 40 or fewer, or split the server boundary`,
  );
}

validateSameMembers(
  "tools.yaml tools and toolboxToolNames",
  toolNames,
  new Set(toolboxToolNames),
);
validateSameMembers(
  "tools.yaml tools and toolboxToolScopes",
  toolNames,
  new Set(Object.keys(toolboxToolScopes)),
);

if (sources.length === 0) errors.push("Toolbox config must declare a source");
for (const source of sources) validateSource(source);
for (const tool of tools) validateTool(tool);
for (const toolset of toolsets) validateToolset(toolset);
validateCapabilityPacks();
validateSemanticCatalogs();

if (errors.length > 0) {
  throw new Error(
    `Toolbox semantic layer validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`,
  );
}

console.log(
  `Toolbox semantic layer is valid: ${tools.length} tools, ${toolsets.length} toolsets, ${sources.length} source, and ${new Set(toolboxBusinessCapabilityPacks.map((pack) => pack.catalog)).size} business catalogs.`,
);

function validateSource(source: ToolboxEntry) {
  const name = readName(source, "source");
  if (
    typeof source.password === "string" &&
    !/^\$\{[A-Z][A-Z0-9_]*\}$/.test(source.password)
  ) {
    errors.push(`${name}: password must be an environment placeholder`);
  }
}

function validateTool(tool: ToolboxEntry) {
  const name = readName(tool, "tool");
  const description = readString(tool.description);
  const statement = readString(tool.statement);
  const annotations = isRecord(tool.annotations) ? tool.annotations : undefined;
  const parameters = Array.isArray(tool.parameters)
    ? tool.parameters.filter(isRecord)
    : [];

  if (
    !legacyToolNames.has(name) &&
    !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name)
  ) {
    errors.push(`${name}: new tool names must use snake_case`);
  }
  if (!description.trim()) errors.push(`${name}: description is required`);
  if (/Use this tool|仅当用户/u.test(description)) {
    errors.push(`${name}: description must state semantics, not routing`);
  }
  for (const required of semanticDescriptionRequirements[name] ?? []) {
    if (!description.includes(required)) {
      errors.push(
        `${name}: description must include ${JSON.stringify(required)}`,
      );
    }
  }

  const expectedAnnotations = {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  };
  for (const [key, value] of Object.entries(expectedAnnotations)) {
    if (annotations?.[key] !== value) {
      errors.push(`${name}: annotations.${key} must be ${value}`);
    }
  }

  if (parameters.length > 5) {
    errors.push(`${name}: model-facing parameters must not exceed five`);
  }
  for (const parameter of parameters as ToolboxParameter[]) {
    const parameterName = readString(parameter.name);
    const parameterDescription = readString(parameter.description);
    if (!parameterName || !parameterDescription) {
      errors.push(`${name}: every parameter needs a name and description`);
    }
    if (
      (parameterName === "from" || parameterName === "to") &&
      !parameterDescription.includes("2026-")
    ) {
      errors.push(`${name}.${parameterName}: needs an ISO-8601 example`);
    }
  }

  const parameterNames = new Set(
    parameters.map((parameter) => readString(parameter.name)),
  );
  if (parameterNames.has("from") !== parameterNames.has("to")) {
    errors.push(`${name}: from and to must be declared together`);
  }
  if (
    parameterNames.has("from") &&
    !statement.includes("public.validate_toolbox_time_window")
  ) {
    errors.push(`${name}: from/to must use validate_toolbox_time_window`);
  }
  if (
    businessToolNames.has(name) &&
    !statement.includes('"ecommerce_fixture".')
  ) {
    errors.push(`${name}: business SQL must explicitly use ecommerce_fixture`);
  }
  if (
    name === "summarize-ecommerce-sales-by-day" &&
    !statement.includes(`("paidAt" AT TIME ZONE 'UTC')::date`)
  ) {
    errors.push(`${name}: UTC buckets must not depend on session timezone`);
  }
  if (
    statement.includes('"TemplateEvent"') &&
    !statement.includes('public."TemplateEvent"')
  ) {
    errors.push(`${name}: platform SQL must qualify public.TemplateEvent`);
  }
  if (
    agentRunRecordTools.has(name) &&
    !statement.includes('public."AgentRun')
  ) {
    errors.push(`${name}: Agent run tools must query durable AgentRun records`);
  }
  if (agentRunRecordTools.has(name) && statement.includes('"TemplateEvent"')) {
    errors.push(`${name}: Agent run tools must not use TemplateEvent`);
  }
  if (
    name === "summarize-tool-invocations" &&
    !statement.includes('results."executionAttempt" = calls."executionAttempt"')
  ) {
    errors.push(
      `${name}: Tool event correlation must include executionAttempt`,
    );
  }
  if (
    name === "list-agent-runs" &&
    (!statement.includes("WITH recent_runs AS MATERIALIZED") ||
      !statement.includes("LEFT JOIN LATERAL"))
  ) {
    errors.push(`${name}: must limit runs before counting events`);
  }

  if (/^list[-_]/.test(name) && !/\bLIMIT\b/i.test(statement)) {
    errors.push(`${name}: list tools must enforce a SQL LIMIT`);
  }
  if (/\bLIMIT\s+\(?\$\d+/i.test(statement)) {
    const limit = parameters.find((parameter) => parameter.name === "limit") as
      | ToolboxParameter
      | undefined;
    if (!limit) {
      errors.push(`${name}: parameterized LIMIT requires limit`);
    } else if (typeof limit.maxValue !== "number" || limit.maxValue > 200) {
      errors.push(`${name}.limit: maxValue must be <= 200`);
    }
  }
  if (pageableBusinessTools.has(name)) {
    if (!/COUNT\(\*\)\s+OVER\s*\(\)/i.test(statement)) {
      errors.push(`${name}: pageable tools must return totalCount`);
    }
    if (!/\bOFFSET\s+\$\d+/i.test(statement)) {
      errors.push(`${name}: pageable tools must enforce OFFSET`);
    }
    const offset = parameters.find(
      (parameter) => parameter.name === "offset",
    ) as ToolboxParameter | undefined;
    if (!offset || typeof offset.maxValue !== "number") {
      errors.push(`${name}.offset: pageable tools need a bounded offset`);
    }
  }
}

function validateToolset(toolset: ToolboxEntry) {
  const name = readName(toolset, "toolset");
  const referencedTools = readStringArray(toolset.tools);
  if (
    !legacyToolsets.has(name) &&
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)
  ) {
    errors.push(`${name}: toolset names must use kebab-case`);
  }
  if (!legacyToolsets.has(name) && referencedTools.length > 8) {
    errors.push(`${name}: capability toolsets must expose at most eight tools`);
  }
  if (new Set(referencedTools).size !== referencedTools.length) {
    errors.push(`${name}: duplicate tool reference`);
  }
  for (const toolName of referencedTools) {
    if (!toolNames.has(toolName))
      errors.push(`${name}: unknown tool ${toolName}`);
  }
}

function validateCapabilityPacks() {
  for (const pack of toolboxBusinessCapabilityPacks) {
    const toolset = toolsetByName.get(pack.toolset);
    if (!toolset) {
      errors.push(`${pack.name}: required toolset ${pack.toolset} is missing`);
      continue;
    }
    validateSameMembers(
      `${pack.name} pack and ${pack.toolset} toolset`,
      new Set(readStringArray(toolset.tools)),
      new Set(pack.tools),
    );
    for (const toolName of pack.tools) {
      if (!toolByName.has(toolName)) {
        errors.push(`${pack.name}: missing tool ${toolName}`);
      }
      if (toolboxToolScopes[toolName] !== pack.scope) {
        errors.push(`${pack.name}: ${toolName} must use scope ${pack.scope}`);
      }
    }
  }
}

function validateSemanticCatalogs() {
  const packsByCatalog = new Map<
    string,
    (typeof toolboxBusinessCapabilityPacks)[number][]
  >();
  for (const pack of toolboxBusinessCapabilityPacks) {
    const packs = packsByCatalog.get(pack.catalog) ?? [];
    packs.push(pack);
    packsByCatalog.set(pack.catalog, packs);
  }

  for (const [catalogFile, packs] of packsByCatalog) {
    const catalogPath = join(semanticRoot, catalogFile);
    const evaluationPath = join(
      semanticRoot,
      catalogFile.replace(/\.yaml$/, "-evaluation.yaml"),
    );
    const catalog = readSingleYamlObject(catalogPath, `${catalogFile} catalog`);
    if (!catalog) continue;
    validateCatalog(
      catalogFile,
      catalog,
      packs.flatMap((pack) => [...pack.tools]),
    );
    validateEvaluation(catalogFile, evaluationPath, catalog);
  }
}

function validateCatalog(
  catalogFile: string,
  catalog: ToolboxEntry,
  expectedTools: string[],
) {
  if (catalog.kind !== "business-semantic-catalog") {
    errors.push(`${catalogFile}: kind must be business-semantic-catalog`);
  }
  if (catalog.databaseSchema !== "ecommerce_fixture") {
    errors.push(`${catalogFile}: databaseSchema must be ecommerce_fixture`);
  }
  if (catalog.timeZone !== "UTC") {
    errors.push(`${catalogFile}: timeZone must be explicit UTC`);
  }
  const result = BusinessSemanticCatalogSchema.safeParse(catalog);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(
        `${catalogFile} schema ${issue.path.join(".")}: ${issue.message}`,
      );
    }
  }

  const metrics = readRecordArray(catalog.metrics, `${catalogFile} metrics`);
  const dimensions = readRecordArray(
    catalog.dimensions,
    `${catalogFile} dimensions`,
  );
  const contracts = readRecordArray(
    catalog.queryContracts,
    `${catalogFile} queryContracts`,
  );
  const patterns = readRecordArray(
    catalog.questionPatterns,
    `${catalogFile} questionPatterns`,
  );
  const terms = new Set<string>();
  const metricById = new Map(
    metrics.map((metric) => [readString(metric.id), metric] as const),
  );

  for (const metric of metrics) {
    validateSemanticEntry(catalogFile, metric, "metric", terms);
    requireString(metric, "definition", `${catalogFile} metric`);
    requireString(metric, "resultField", `${catalogFile} metric`);
    requireString(metric, "timeField", `${catalogFile} metric`);
    validateSemanticToolReferences(catalogFile, metric, "metric");
  }
  for (const dimension of dimensions) {
    validateSemanticEntry(catalogFile, dimension, "dimension", terms);
    requireString(dimension, "field", `${catalogFile} dimension`);
    const values = dimension.values ?? dimension.fixtureValues;
    if (!values && !isRecord(dimension.valueSource)) {
      errors.push(
        `${catalogFile} ${readString(dimension.id)}: values or valueSource required`,
      );
    }
  }

  const contractTools = new Set(
    contracts.map((contract) => readString(contract.tool)).filter(Boolean),
  );
  validateSameMembers(
    `${catalogFile} query contracts and capability pack tools`,
    contractTools,
    new Set(expectedTools),
  );
  const contractToolById = new Map(
    contracts.map((contract) => [
      readString(contract.id),
      readString(contract.tool),
    ]),
  );
  const contractByTool = new Map(
    contracts.map((contract) => [readString(contract.tool), contract] as const),
  );
  validateMetricContractSemantics(
    catalogFile,
    metrics,
    metricById,
    contractByTool,
  );
  const patternTools = new Set<string>();
  for (const pattern of patterns) {
    const id = requireString(pattern, "id", `${catalogFile} question pattern`);
    const tool = requireString(pattern, "tool", `${catalogFile} ${id}`);
    const contract = requireString(pattern, "contract", `${catalogFile} ${id}`);
    patternTools.add(tool);
    if (!toolNames.has(tool))
      errors.push(`${catalogFile} ${id}: unknown tool ${tool}`);
    if (contractToolById.get(contract) !== tool) {
      errors.push(`${catalogFile} ${id}: contract must certify routed tool`);
    }
  }
  validateSameMembers(
    `${catalogFile} question routes and capability pack tools`,
    patternTools,
    new Set(expectedTools),
  );

  for (const ambiguity of readRecordArray(
    catalog.ambiguities,
    `${catalogFile} ambiguities`,
  )) {
    requireString(ambiguity, "term", `${catalogFile} ambiguity`);
    if (ambiguity.action !== "clarify") {
      errors.push(`${catalogFile}: ambiguity action must be clarify`);
    }
  }
}

function validateMetricContractSemantics(
  catalogFile: string,
  metrics: ToolboxEntry[],
  metricById: ReadonlyMap<string, ToolboxEntry>,
  contractByTool: ReadonlyMap<string, ToolboxEntry>,
) {
  for (const metric of metrics) {
    const metricId = readString(metric.id);
    const resultField = readString(metric.resultField);
    for (const tool of readStringArray(metric.tools)) {
      const contract = contractByTool.get(tool);
      if (!contract) continue;
      if (!readStringArray(contract.metrics).includes(metricId)) {
        errors.push(
          `${catalogFile} ${metricId}: tool ${tool} references the metric but its query contract does not`,
        );
      }
      if (!readStringArray(contract.resultFields).includes(resultField)) {
        errors.push(
          `${catalogFile} ${metricId}: ${tool} must project canonical resultField ${resultField}`,
        );
      }
    }
  }

  for (const [tool, contract] of contractByTool) {
    const contractResultFields = readStringArray(contract.resultFields);
    for (const metricId of readStringArray(contract.metrics)) {
      const metric = metricById.get(metricId);
      if (!metric) continue;
      if (!readStringArray(metric.tools).includes(tool)) {
        errors.push(
          `${catalogFile} ${tool}: query contract references ${metricId}, but the metric does not certify this tool`,
        );
      }
      const resultField = readString(metric.resultField);
      if (!contractResultFields.includes(resultField)) {
        errors.push(
          `${catalogFile} ${tool}: contract metric ${metricId} requires resultField ${resultField}`,
        );
      }
    }
  }
}

function validateEvaluation(
  catalogFile: string,
  evaluationPath: string,
  catalog: ToolboxEntry,
) {
  const evaluation = readSingleYamlObject(
    evaluationPath,
    `${catalogFile} evaluation`,
  );
  if (!evaluation) return;
  if (evaluation.kind !== "semantic-query-evaluation") {
    errors.push(
      `${catalogFile}: evaluation kind must be semantic-query-evaluation`,
    );
  }
  if (evaluation.catalog !== catalog.name) {
    errors.push(`${catalogFile}: evaluation must reference catalog name`);
  }
  if (evaluation.timeZone !== catalog.timeZone) {
    errors.push(`${catalogFile}: evaluation timeZone must match catalog`);
  }
  const asOf = readString(evaluation.asOf);
  if (!asOf || Number.isNaN(Date.parse(asOf))) {
    errors.push(`${catalogFile}: evaluation asOf must be an ISO-8601 instant`);
  }

  const knownTerms = new Set(
    [
      ...readRecordArray(catalog.metrics, `${catalogFile} metrics`),
      ...readRecordArray(catalog.dimensions, `${catalogFile} dimensions`),
    ]
      .map((entry) => readString(entry.id))
      .filter(Boolean),
  );
  const patterns = new Map(
    readRecordArray(catalog.questionPatterns, `${catalogFile} patterns`).map(
      (entry) => [readString(entry.id), readString(entry.tool)] as const,
    ),
  );
  const ambiguousTerms = new Set(
    readRecordArray(catalog.ambiguities, `${catalogFile} ambiguities`).map(
      (entry) => readString(entry.term),
    ),
  );
  const cases = readRecordArray(
    evaluation.cases,
    `${catalogFile} evaluation cases`,
  );
  const categories = new Set<string>();
  const routedTools = new Set<string>();

  for (const testCase of cases) {
    const id = requireString(testCase, "id", `${catalogFile} evaluation case`);
    const category = requireString(
      testCase,
      "category",
      `${catalogFile} ${id}`,
    );
    requireString(testCase, "question", `${catalogFile} ${id}`);
    categories.add(category);
    const expected = isRecord(testCase.expected)
      ? testCase.expected
      : undefined;
    if (!expected) {
      errors.push(`${catalogFile} ${id}: expected is required`);
      continue;
    }
    if (typeof expected.requiresClarification !== "boolean") {
      errors.push(
        `${catalogFile} ${id}: requiresClarification must be boolean`,
      );
      continue;
    }
    if (expected.requiresClarification) {
      if (!ambiguousTerms.has(readString(expected.ambiguity))) {
        errors.push(`${catalogFile} ${id}: ambiguity must exist in catalog`);
      }
      continue;
    }
    const intent = readString(expected.intent);
    const tool = readString(expected.tool);
    if (!patterns.has(intent)) {
      errors.push(`${catalogFile} ${id}: unknown intent ${intent}`);
    }
    if (patterns.get(intent) !== tool) {
      errors.push(`${catalogFile} ${id}: intent and tool do not match`);
    }
    if (!toolNames.has(tool))
      errors.push(`${catalogFile} ${id}: unknown tool ${tool}`);
    if (category === "route") routedTools.add(tool);
    for (const term of readStringArray(expected.terms)) {
      if (!knownTerms.has(term)) {
        errors.push(`${catalogFile} ${id}: unknown semantic term ${term}`);
      }
    }
  }

  const expectedTools = toolboxBusinessCapabilityPacks
    .filter((pack) => pack.catalog === catalogFile)
    .flatMap((pack) => [...pack.tools]);
  if (catalogFile !== "ecommerce.yaml") {
    validateSameMembers(
      `${catalogFile} route evaluations and capability pack tools`,
      routedTools,
      new Set(expectedTools),
    );
  }

  const requiredCategories =
    catalogFile === "ecommerce.yaml"
      ? [
          "ambiguity",
          "capability-isolation",
          "empty-result",
          "invalid-window",
          "partial-refund",
          "pagination",
          "route",
          "utc-boundary",
        ]
      : ["ambiguity", "empty-result", "exception", "route"];
  for (const category of requiredCategories) {
    if (!categories.has(category)) {
      errors.push(`${catalogFile}: evaluation must cover ${category}`);
    }
  }
}

function validateSemanticEntry(
  catalogFile: string,
  entry: ToolboxEntry,
  kind: string,
  terms: Set<string>,
) {
  const id = requireString(entry, "id", `${catalogFile} ${kind}`);
  const labels = readStringArray(entry.labels);
  if (labels.length === 0) errors.push(`${catalogFile} ${id}: labels required`);
  for (const label of labels) {
    const normalized = label.trim().toLocaleLowerCase("zh-CN");
    if (terms.has(normalized)) {
      errors.push(`${catalogFile} ${id}: duplicate business term ${label}`);
    }
    terms.add(normalized);
  }
}

function validateSemanticToolReferences(
  catalogFile: string,
  entry: ToolboxEntry,
  kind: string,
) {
  const id = readString(entry.id) || kind;
  const tools = readStringArray(entry.tools);
  if (tools.length === 0) errors.push(`${catalogFile} ${id}: tools required`);
  for (const tool of tools) {
    if (!toolNames.has(tool))
      errors.push(`${catalogFile} ${id}: unknown tool ${tool}`);
  }
}

function readYamlDocuments(path: string, label: string): ToolboxEntry[] {
  if (!existsSync(path)) {
    errors.push(`${label}: missing ${path}`);
    return [];
  }
  const documents = parseAllDocuments(readFileSync(path, "utf8"));
  const result: ToolboxEntry[] = [];
  for (const [index, document] of documents.entries()) {
    for (const error of document.errors) {
      errors.push(`${label} document ${index + 1}: ${error.message}`);
    }
    if (document.errors.length === 0) {
      const value = document.toJS({ maxAliasCount: 100 }) as unknown;
      if (isRecord(value)) result.push(value);
      else errors.push(`${label} document ${index + 1}: must be an object`);
    }
  }
  return result;
}

function readSingleYamlObject(path: string, label: string) {
  const documents = readYamlDocuments(path, label);
  if (documents.length !== 1) {
    errors.push(`${label}: must contain exactly one YAML object`);
    return undefined;
  }
  return documents[0];
}

function validateSameMembers(
  label: string,
  actual: ReadonlySet<string>,
  expected: ReadonlySet<string>,
) {
  const missing = [...expected].filter((item) => !actual.has(item)).sort();
  const unexpected = [...actual].filter((item) => !expected.has(item)).sort();
  if (missing.length > 0)
    errors.push(`${label}: missing [${missing.join(", ")}]`);
  if (unexpected.length > 0) {
    errors.push(`${label}: unexpected [${unexpected.join(", ")}]`);
  }
}

function readRecordArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    errors.push(`${label}: must be an array`);
    return [];
  }
  return value.filter(isRecord);
}

function requireString(entry: ToolboxEntry, key: string, label: string) {
  const value = readString(entry[key]);
  if (!value) errors.push(`${label}: ${key} is required`);
  return value;
}

function isRecord(value: unknown): value is ToolboxEntry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readName(entry: ToolboxEntry, kind: string) {
  return requireString(entry, "name", kind);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
