import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";

type ToolboxEntry = Record<string, unknown>;

type ToolboxParameter = {
  description?: unknown;
  maxValue?: unknown;
  name?: unknown;
};

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const toolboxConfigPath = join(repositoryRoot, "apps/toolbox/tools.yaml");
const toolboxConfig = readFileSync(toolboxConfigPath, "utf8");
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
  "ecommerce-product-analytics": ["list-ecommerce-top-products"],
  "ecommerce-sales-analytics": [
    "summarize-ecommerce-sales-by-day",
    "summarize-ecommerce-sales-by-channel",
  ],
};
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
};

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

  if (/^list[-_]/.test(name) && !/\bLIMIT\b/i.test(statement)) {
    errors.push(`${name}: list tools must enforce a SQL LIMIT`);
  }

  if (/\bLIMIT\s+\$\d+/i.test(statement)) {
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
