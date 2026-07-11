import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";
import { BusinessSemanticCatalogSchema } from "@agent-template/toolbox-config";

type ToolboxEntry = Record<string, unknown>;

type ToolboxParameter = {
  description?: unknown;
  maxValue?: unknown;
  name?: unknown;
};

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const toolboxConfigPath = join(repositoryRoot, "apps/toolbox/tools.yaml");
const toolboxConfig = readFileSync(toolboxConfigPath, "utf8");
const ecommerceSemanticCatalogPath = join(
  repositoryRoot,
  "apps/toolbox/semantic/ecommerce.yaml",
);
const ecommerceSemanticEvaluationPath = join(
  repositoryRoot,
  "apps/toolbox/semantic/ecommerce-evaluation.yaml",
);
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
const expectedToolsets: Record<string, string[]> = {
  "ecommerce-fulfillment-operations": [
    "list-ecommerce-fulfillment-exceptions",
    "get-ecommerce-order-detail",
  ],
  "ecommerce-order-operations": [
    "list-ecommerce-orders-in-window",
    "get-ecommerce-order-detail",
  ],
  "ecommerce-product-analytics": [
    "list-ecommerce-top-products",
    "summarize_merchandise_by_category",
  ],
  "ecommerce-sales-analytics": [
    "summarize-ecommerce-sales-by-day",
    "summarize-ecommerce-sales-by-channel",
    "summarize_sales_by_region",
    "summarize_sales_by_customer_segment",
  ],
};
const ecommerceBusinessTools = new Set(Object.values(expectedToolsets).flat());
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
const pageableBusinessTools = new Set([
  "list-ecommerce-fulfillment-exceptions",
  "list-ecommerce-orders-in-window",
  "list-ecommerce-top-products",
]);

const documents = parseAllDocuments(toolboxConfig);
for (const [index, document] of documents.entries()) {
  for (const error of document.errors) {
    errors.push(`YAML document ${index + 1}: ${error.message}`);
  }
}

const entries = documents
  .filter((document) => document.errors.length === 0)
  .map((document) => document.toJS({ maxAliasCount: 100 }))
  .filter(isToolboxEntry);
const sources = entries.filter((entry) => entry.kind === "source");
const tools = entries.filter((entry) => entry.kind === "tool");
const toolsets = entries.filter((entry) => entry.kind === "toolset");
const toolNames = new Set(tools.map((tool) => readName(tool, "tool")));
const toolsetByName = new Map(
  toolsets.map((toolset) => [readName(toolset, "toolset"), toolset]),
);

const ecommerceSemanticCatalog = validateEcommerceSemanticCatalog();
if (ecommerceSemanticCatalog) {
  validateEcommerceSemanticEvaluation(ecommerceSemanticCatalog);
}

if (sources.length === 0) {
  errors.push("Toolbox config must declare at least one source");
}

for (const source of sources) {
  const name = readName(source, "source");
  const password = source.password;

  if (
    typeof password === "string" &&
    !/^\$\{[A-Z][A-Z0-9_]*\}$/.test(password)
  ) {
    errors.push(`${name}: password must be an environment placeholder`);
  }
}

for (const tool of tools) {
  validateTool(tool);
}

for (const toolset of toolsets) {
  validateToolset(toolset);
}

for (const [toolsetName, expectedTools] of Object.entries(expectedToolsets)) {
  const toolset = toolsetByName.get(toolsetName);
  if (!toolset) {
    errors.push(`${toolsetName}: required semantic toolset is missing`);
    continue;
  }

  const actualTools = readStringArray(toolset.tools);
  if (!sameMembers(actualTools, expectedTools)) {
    errors.push(
      `${toolsetName}: expected tools [${expectedTools.join(", ")}], received [${actualTools.join(", ")}]`,
    );
  }
}

if (errors.length > 0) {
  throw new Error(
    `Toolbox semantic layer validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`,
  );
}

console.log(
  `Toolbox semantic layer is valid: ${tools.length} tools, ${toolsets.length} toolsets, ${sources.length} source.`,
);

function validateTool(tool: ToolboxEntry) {
  const name = readName(tool, "tool");
  const description = readString(tool.description);
  const statement = readString(tool.statement);
  const annotations = isToolboxEntry(tool.annotations)
    ? tool.annotations
    : undefined;
  const parameters = Array.isArray(tool.parameters)
    ? tool.parameters.filter(isToolboxEntry)
    : [];

  if (
    !legacyToolNames.has(name) &&
    !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name)
  ) {
    errors.push(
      `${name}: new tool names must use the official snake_case convention`,
    );
  }

  if (!description.trim()) {
    errors.push(`${name}: description is required`);
  }

  if (/Use this tool|仅当用户/u.test(description)) {
    errors.push(
      `${name}: description must explain semantics without imperative routing text`,
    );
  }

  for (const requiredText of semanticDescriptionRequirements[name] ?? []) {
    if (!description.includes(requiredText)) {
      errors.push(
        `${name}: description must include semantic definition ${JSON.stringify(requiredText)}`,
      );
    }
  }

  const expectedAnnotations = {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  };
  for (const [key, expected] of Object.entries(expectedAnnotations)) {
    if (annotations?.[key] !== expected) {
      errors.push(`${name}: annotations.${key} must be ${expected}`);
    }
  }

  if (parameters.length > 5) {
    errors.push(`${name}: keep model-facing parameters at five or fewer`);
  }

  for (const parameter of parameters as ToolboxParameter[]) {
    const parameterName = readString(parameter.name);
    const parameterDescription = readString(parameter.description);

    if (!parameterName || !parameterDescription) {
      errors.push(`${name}: every parameter needs a name and description`);
      continue;
    }

    if (
      (parameterName === "from" || parameterName === "to") &&
      !parameterDescription.includes("2026-06-")
    ) {
      errors.push(
        `${name}.${parameterName}: ISO-8601 parameters need a concrete formatting example`,
      );
    }
  }

  const parameterNames = new Set(
    parameters.map((parameter) => readString(parameter.name)),
  );
  if (
    parameterNames.has("from") &&
    parameterNames.has("to") &&
    !statement.includes("public.validate_toolbox_time_window")
  ) {
    errors.push(
      `${name}: from/to queries must enforce the database time-window guard`,
    );
  }

  if (
    name === "summarize-ecommerce-sales-by-day" &&
    !statement.includes(`("paidAt" AT TIME ZONE 'UTC')::date`)
  ) {
    errors.push(
      `${name}: UTC day buckets must not depend on the PostgreSQL session timezone`,
    );
  }

  if (
    ecommerceBusinessTools.has(name) &&
    !statement.includes('"ecommerce_fixture"."Ecommerce')
  ) {
    errors.push(
      `${name}: ecommerce fixture queries must use the isolated ecommerce_fixture schema`,
    );
  }

  if (
    statement.includes('"TemplateEvent"') &&
    !statement.includes('public."TemplateEvent"')
  ) {
    errors.push(`${name}: platform queries must qualify the public schema`);
  }

  if (/^list[-_]/.test(name) && !/\bLIMIT\b/i.test(statement)) {
    errors.push(`${name}: list tools must enforce a SQL LIMIT`);
  }

  if (/\bLIMIT\s+\(?\$\d+/i.test(statement)) {
    const limit = parameters.find((parameter) => parameter.name === "limit") as
      | ToolboxParameter
      | undefined;
    if (!limit) {
      errors.push(`${name}: parameterized LIMIT requires a limit parameter`);
    } else if (typeof limit.maxValue !== "number" || limit.maxValue > 200) {
      errors.push(
        `${name}.limit: maxValue must be a number no greater than 200`,
      );
    }
  }

  if (pageableBusinessTools.has(name)) {
    if (!/COUNT\(\*\)\s+OVER\s*\(\)/i.test(statement)) {
      errors.push(
        `${name}: pageable business tools must return totalCount for exact hasMore`,
      );
    }
    if (!/\bOFFSET\s+\$\d+/i.test(statement)) {
      errors.push(`${name}: pageable business tools must enforce SQL OFFSET`);
    }
    const offset = parameters.find(
      (parameter) => parameter.name === "offset",
    ) as ToolboxParameter | undefined;
    if (!offset || typeof offset.maxValue !== "number") {
      errors.push(`${name}.offset: pageable tools require a bounded offset`);
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
    errors.push(
      `${name}: capability toolsets must expose at most eight tools to reduce context rot`,
    );
  }

  if (new Set(referencedTools).size !== referencedTools.length) {
    errors.push(`${name}: toolset contains duplicate tools`);
  }

  for (const toolName of referencedTools) {
    if (!toolNames.has(toolName)) {
      errors.push(`${name}: references unknown tool ${toolName}`);
    }
  }
}

function validateEcommerceSemanticCatalog(): ToolboxEntry | undefined {
  const documents = parseAllDocuments(
    readFileSync(ecommerceSemanticCatalogPath, "utf8"),
  );

  for (const [index, document] of documents.entries()) {
    for (const error of document.errors) {
      errors.push(
        `Ecommerce semantic catalog document ${index + 1}: ${error.message}`,
      );
    }
  }

  const catalog = documents.length === 1 ? documents[0]?.toJS() : undefined;
  if (!isToolboxEntry(catalog)) {
    errors.push("Ecommerce semantic catalog must contain one YAML object");
    return undefined;
  }

  if (catalog.kind !== "business-semantic-catalog") {
    errors.push(
      "Ecommerce semantic catalog kind must be business-semantic-catalog",
    );
  }

  if (catalog.databaseSchema !== "ecommerce_fixture") {
    errors.push(
      "Ecommerce semantic catalog databaseSchema must be ecommerce_fixture",
    );
  }

  const schemaResult = BusinessSemanticCatalogSchema.safeParse(catalog);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push(
        `Ecommerce semantic catalog schema ${issue.path.join(".")}: ${issue.message}`,
      );
    }
  }

  const terms = new Set<string>();
  const metrics = readRecordArray(catalog.metrics, "metrics");
  const dimensions = readRecordArray(catalog.dimensions, "dimensions");
  const questionPatterns = readRecordArray(
    catalog.questionPatterns,
    "questionPatterns",
  );
  const referencedTools = new Set<string>();
  const queryContracts = readRecordArray(
    catalog.queryContracts,
    "queryContracts",
  );
  const contractToolById = new Map(
    queryContracts.map((contract) => [
      readString(contract.id),
      readString(contract.tool),
    ]),
  );

  for (const metric of metrics) {
    validateSemanticEntry(metric, "metric", terms);
    validateSemanticToolReferences(metric, "metric");
    for (const tool of readStringArray(metric.tools)) referencedTools.add(tool);
    requireString(metric, "definition", "metric");
    requireString(metric, "resultField", "metric");
    requireString(metric, "timeField", "metric");
  }

  for (const dimension of dimensions) {
    validateSemanticEntry(dimension, "dimension", terms);
    requireString(dimension, "field", "dimension");
    const valueCollection = dimension.values ?? dimension.fixtureValues;
    const values = valueCollection
      ? readRecordArray(
          valueCollection,
          `${readString(dimension.id) || "dimension"} values`,
        )
      : [];
    if (values.length === 0 && !isToolboxEntry(dimension.valueSource)) {
      errors.push(
        `${readString(dimension.id) || "dimension"}: values or valueSource are required`,
      );
    }

    for (const value of values) {
      requireString(value, "value", "dimension value");
      const labels = readStringArray(value.labels);
      if (labels.length === 0) {
        errors.push(
          `${readString(dimension.id) || "dimension"}: every value needs business labels`,
        );
      }
    }
  }

  for (const pattern of questionPatterns) {
    requireString(pattern, "id", "question pattern");
    requireString(pattern, "tool", "question pattern");
    requireString(pattern, "contract", "question pattern");
    const tool = readString(pattern.tool);
    const contract = readString(pattern.contract);
    if (tool && !toolNames.has(tool)) {
      errors.push(
        `question pattern ${readString(pattern.id)}: unknown tool ${tool}`,
      );
    }
    if (tool) referencedTools.add(tool);
    if (!contractToolById.has(contract)) {
      errors.push(
        `question pattern ${readString(pattern.id)}: unknown query contract ${contract}`,
      );
    } else if (contractToolById.get(contract) !== tool) {
      errors.push(
        `question pattern ${readString(pattern.id)}: query contract must certify the routed tool`,
      );
    }
  }

  const certifiedBusinessTools = new Set(
    Object.values(expectedToolsets).flat(),
  );
  const contractTools = new Set(
    queryContracts.map((contract) => readString(contract.tool)).filter(Boolean),
  );
  for (const tool of certifiedBusinessTools) {
    if (!referencedTools.has(tool)) {
      errors.push(
        `Ecommerce semantic catalog must reference certified business tool ${tool}`,
      );
    }
    if (!contractTools.has(tool)) {
      errors.push(
        `Ecommerce semantic catalog must define a query contract for ${tool}`,
      );
    }
  }

  for (const ambiguity of readRecordArray(catalog.ambiguities, "ambiguities")) {
    requireString(ambiguity, "term", "ambiguity");
    if (ambiguity.action !== "clarify") {
      errors.push(
        `${readString(ambiguity.term) || "ambiguity"}: action must be clarify`,
      );
    }
  }

  return catalog;
}

function validateEcommerceSemanticEvaluation(catalog: ToolboxEntry) {
  const documents = parseAllDocuments(
    readFileSync(ecommerceSemanticEvaluationPath, "utf8"),
  );

  for (const [index, document] of documents.entries()) {
    for (const error of document.errors) {
      errors.push(
        `Ecommerce semantic evaluation document ${index + 1}: ${error.message}`,
      );
    }
  }

  const evaluation = documents.length === 1 ? documents[0]?.toJS() : undefined;
  if (!isToolboxEntry(evaluation)) {
    errors.push("Ecommerce semantic evaluation must contain one YAML object");
    return;
  }

  if (evaluation.kind !== "semantic-query-evaluation") {
    errors.push(
      "Ecommerce semantic evaluation kind must be semantic-query-evaluation",
    );
  }

  if (evaluation.catalog !== catalog.name) {
    errors.push(
      "Ecommerce semantic evaluation must reference the catalog name",
    );
  }

  const knownTerms = new Set(
    [
      ...readRecordArray(catalog.metrics, "metrics"),
      ...readRecordArray(catalog.dimensions, "dimensions"),
    ]
      .map((entry) => readString(entry.id))
      .filter(Boolean),
  );
  const patternTools = new Map(
    readRecordArray(catalog.questionPatterns, "questionPatterns")
      .map((entry) => [readString(entry.id), readString(entry.tool)] as const)
      .filter(([id, tool]) => Boolean(id) && Boolean(tool)),
  );
  const ambiguousTerms = new Set(
    readRecordArray(catalog.ambiguities, "ambiguities")
      .map((entry) => readString(entry.term))
      .filter(Boolean),
  );
  const cases = readRecordArray(evaluation.cases, "semantic evaluation cases");
  const requiredEvaluationCategories = new Set([
    "ambiguity",
    "capability-isolation",
    "empty-result",
    "invalid-window",
    "partial-refund",
    "pagination",
    "route",
    "utc-boundary",
  ]);
  const evaluationCategories = new Set<string>();

  if (cases.length === 0) {
    errors.push("Ecommerce semantic evaluation must contain cases");
  }

  for (const testCase of cases) {
    const id = readString(testCase.id) || "semantic evaluation case";
    requireString(testCase, "id", "semantic evaluation case");
    requireString(testCase, "category", id);
    requireString(testCase, "question", id);
    evaluationCategories.add(readString(testCase.category));
    const expected = isToolboxEntry(testCase.expected)
      ? testCase.expected
      : undefined;
    if (!expected) {
      errors.push(`${id}: expected is required`);
      continue;
    }

    if (typeof expected.requiresClarification !== "boolean") {
      errors.push(`${id}: expected.requiresClarification must be boolean`);
      continue;
    }

    if (expected.requiresClarification) {
      const ambiguity = readString(expected.ambiguity);
      if (!ambiguousTerms.has(ambiguity)) {
        errors.push(`${id}: ambiguity must exist in the semantic catalog`);
      }
      continue;
    }

    const intent = readString(expected.intent);
    const tool = readString(expected.tool);
    if (!patternTools.has(intent)) {
      errors.push(`${id}: expected intent must exist in the semantic catalog`);
    }
    if (!toolNames.has(tool)) {
      errors.push(`${id}: expected tool must exist in tools.yaml`);
    }
    if (patternTools.get(intent) && patternTools.get(intent) !== tool) {
      errors.push(
        `${id}: expected tool must match the intent's certified tool`,
      );
    }
    const terms = readStringArray(expected.terms);
    if (terms.length === 0) {
      errors.push(`${id}: expected terms are required`);
    }
    for (const term of terms) {
      if (!knownTerms.has(term)) {
        errors.push(
          `${id}: expected term ${term} must exist in the semantic catalog`,
        );
      }
    }
  }

  for (const category of requiredEvaluationCategories) {
    if (!evaluationCategories.has(category)) {
      errors.push(
        `Ecommerce semantic evaluation must cover category ${category}`,
      );
    }
  }
}

function validateSemanticEntry(
  entry: ToolboxEntry,
  kind: string,
  terms: Set<string>,
) {
  const id = readString(entry.id);
  requireString(entry, "id", kind);
  const labels = readStringArray(entry.labels);
  if (labels.length === 0) {
    errors.push(`${id || kind}: labels are required`);
  }

  for (const label of labels) {
    const normalized = label.trim().toLocaleLowerCase("zh-CN");
    if (terms.has(normalized)) {
      errors.push(`${id || kind}: duplicate business term ${label}`);
    }
    terms.add(normalized);
  }
}

function validateSemanticToolReferences(entry: ToolboxEntry, kind: string) {
  const id = readString(entry.id) || kind;
  const tools = readStringArray(entry.tools);
  if (tools.length === 0) {
    errors.push(`${id}: ${kind} must reference at least one approved tool`);
  }

  for (const tool of tools) {
    if (!toolNames.has(tool)) {
      errors.push(`${id}: references unknown tool ${tool}`);
    }
  }
}

function readRecordArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }

  return value.filter((item): item is ToolboxEntry => isToolboxEntry(item));
}

function requireString(entry: ToolboxEntry, key: string, label: string) {
  if (!readString(entry[key])) {
    errors.push(`${label}: ${key} is required`);
  }
}

function isToolboxEntry(value: unknown): value is ToolboxEntry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readName(entry: ToolboxEntry, kind: string) {
  const name = readString(entry.name);
  if (!name) {
    errors.push(`${kind}: name is required`);
  }
  return name;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function sameMembers(left: string[], right: string[]) {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}
