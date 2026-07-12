import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BusinessSemanticCatalogSchema,
  createSemanticQueryEngine,
  type BusinessSemanticCatalog,
  type SemanticQueryProposal,
  type SemanticQueryResponse,
} from "@agent-template/semantic-query";
import {
  resolveToolboxCapabilityProfile,
  toolboxBusinessCapabilityPacks,
  type ToolboxCapabilityProfile,
} from "@agent-template/toolbox-config";
import { parseAllDocuments } from "yaml";

type RecordValue = Record<string, unknown>;

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const semanticRoot = join(repositoryRoot, "apps/toolbox/semantic");
const toolsPath = join(repositoryRoot, "apps/toolbox/tools.yaml");
const errors: string[] = [];
const toolParameters = readToolParameters();

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  let evaluatedCases = 0;
  for (const catalogFile of new Set(
    toolboxBusinessCapabilityPacks.map(({ catalog }) => catalog),
  )) {
    const catalog = readCatalog(catalogFile);
    const evaluation = readYamlObject(
      join(semanticRoot, catalogFile.replace(/\.yaml$/u, "-evaluation.yaml")),
    );
    const asOf = readString(evaluation.asOf);
    const cases = readRecordArray(evaluation.cases);

    for (const testCase of cases) {
      try {
        await evaluateCase(catalog, asOf, testCase);
        evaluatedCases += 1;
      } catch (error) {
        const id = readString(testCase.id) || "unknown-case";
        errors.push(
          `${catalogFile}/${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Toolbox semantic resolver golden evaluations failed:\n${errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }

  console.log(
    `Toolbox semantic resolver golden evaluations passed: ${evaluatedCases} cases.`,
  );
}

async function evaluateCase(
  catalog: BusinessSemanticCatalog,
  asOf: string,
  testCase: RecordValue,
) {
  const question = requireString(testCase, "question");
  const expected = requireRecord(testCase, "expected");
  const expectedIntent = readString(expected.intent);
  const expectedTool = readString(expected.tool);
  const expectedArguments = isRecord(expected.arguments)
    ? expected.arguments
    : {};
  const proposal: SemanticQueryProposal = {
    catalog: catalog.name,
    ...(expectedIntent ? { intent: expectedIntent } : {}),
    ...(Array.isArray(expected.terms)
      ? { terms: expected.terms.filter(isNonEmptyString) }
      : {}),
    ...(readTimeExpression(question)
      ? { timeExpression: readTimeExpression(question) }
      : {}),
  };
  const category = requireString(testCase, "category");

  if (category === "capability-isolation") {
    const forbiddenProfile = readProfile(expected.forbiddenProfile);
    const forbidden = await executeQuery(
      catalog,
      asOf,
      question,
      proposal,
      resolveToolboxCapabilityProfile(forbiddenProfile).semanticExecutionTools,
      expected,
    );
    assertResponseType(forbidden, "unsupported");
    assertEqual(
      forbidden.code,
      "capability_not_allowed",
      "forbidden profile response code",
    );

    const allowedProfile = readProfile(expected.allowedProfile);
    const allowed = await executeQuery(
      catalog,
      asOf,
      question,
      proposal,
      resolveToolboxCapabilityProfile(allowedProfile).semanticExecutionTools,
      expected,
    );
    assertResult(
      allowed,
      expectedIntent,
      expectedTool,
      expected,
      expectedArguments,
    );
    return;
  }

  const response = await executeQuery(
    catalog,
    asOf,
    question,
    proposal,
    catalog.queryContracts.map(({ tool }) => tool),
    expected,
  );

  if (expected.requiresClarification === true) {
    assertResponseType(response, "clarification");
    assertEqual(response.code, "ambiguous_term", "clarification code");
    assertEqual(response.term, expected.ambiguity, "ambiguity term");
    assertQueryId(response);
    return;
  }

  if (expected.requiresValidationError === true) {
    assertResponseType(response, "unsupported");
    assertEqual(
      response.code,
      "unsupported_time_window",
      "invalid time window response code",
    );
    assertQueryId(response);
    return;
  }

  assertResult(
    response,
    expectedIntent,
    expectedTool,
    expected,
    expectedArguments,
  );
}

async function executeQuery(
  catalog: BusinessSemanticCatalog,
  asOf: string,
  question: string,
  proposal: SemanticQueryProposal,
  allowedTools: readonly string[],
  expected: RecordValue,
) {
  const engine = createSemanticQueryEngine({
    allowedTools,
    catalogs: [catalog],
    executeTool: async (tool) => buildCertifiedRows(catalog, tool, expected),
    now: asOf,
  });
  return engine.query({ proposal, question });
}

function assertResult(
  response: SemanticQueryResponse,
  expectedIntent: string,
  expectedTool: string,
  expected: RecordValue,
  expectedArguments: RecordValue,
) {
  assertResponseType(response, "result");
  assertQueryId(response);
  assertEqual(response.plan.intent, expectedIntent, "resolved intent");
  assertEqual(response.plan.tool, expectedTool, "resolved Tool");
  assertEqual(response.plan.catalogVersion, 1, "catalog version");
  if (Array.isArray(expected.terms)) {
    assertDeepEqual(
      [...response.plan.terms].sort(),
      expected.terms.filter(isNonEmptyString).sort(),
      "canonical terms",
    );
  }
  for (const [name, value] of Object.entries(expectedArguments)) {
    assertEqual(response.plan.arguments[name], value, `argument ${name}`);
  }

  const expectedResult = isRecord(expected.result) ? expected.result : {};
  if (typeof expectedResult.rowCount === "number") {
    assertEqual(response.rowCount, expectedResult.rowCount, "row count");
  }
  if (expectedResult.firstSalesDate !== undefined) {
    assertEqual(
      response.data[0]?.salesDate,
      expectedResult.firstSalesDate,
      "first sales date",
    );
  }
  for (const field of ["paidTotal", "refundedTotal"] as const) {
    if (expectedResult[field] !== undefined) {
      assertEqual(response.data[0]?.[field], expectedResult[field], field);
    }
  }
}

function buildCertifiedRows(
  catalog: BusinessSemanticCatalog,
  tool: string,
  expected: RecordValue,
) {
  const contract = catalog.queryContracts.find((item) => item.tool === tool);
  if (!contract) throw new Error(`missing contract for ${tool}`);
  const expectedResult = isRecord(expected.result) ? expected.result : {};
  if (expectedResult.rowCount === 0) return [];

  const row = Object.fromEntries(
    contract.resultFields.map((field) => [field, neutralResultValue(field)]),
  ) as RecordValue;
  if (expectedResult.firstSalesDate !== undefined) {
    row.salesDate = expectedResult.firstSalesDate;
  }
  for (const field of ["paidTotal", "refundedTotal"] as const) {
    if (expectedResult[field] !== undefined) row[field] = expectedResult[field];
  }
  return [row];
}

function neutralResultValue(field: string) {
  if (field === "items") return [];
  if (/At$|Date$/u.test(field)) return "2026-06-01T00:00:00Z";
  if (/Number$|Code$|Name$|status$|channel$|region$|category$/iu.test(field)) {
    return "fixture";
  }
  return field === "totalCount" ? 1 : 0;
}

function readCatalog(catalogFile: string) {
  const raw = readYamlObject(join(semanticRoot, catalogFile));
  const contracts = readRecordArray(raw.queryContracts).map((contract) => {
    const tool = requireString(contract, "tool");
    const parameters = toolParameters.get(tool);
    if (!parameters) throw new Error(`${catalogFile}: unknown Tool ${tool}`);
    return { ...contract, parameters };
  });
  return BusinessSemanticCatalogSchema.parse({
    ...raw,
    queryContracts: contracts,
  });
}

function readToolParameters() {
  const result = new Map<
    string,
    Array<{ default?: string | number; name: string; required: boolean }>
  >();
  for (const document of parseAllDocuments(readFileSync(toolsPath, "utf8"))) {
    if (document.errors.length > 0) {
      throw new Error(document.errors.map(({ message }) => message).join("\n"));
    }
    const entry = document.toJS({ maxAliasCount: 100 }) as unknown;
    if (!isRecord(entry) || entry.kind !== "tool") continue;
    const name = requireString(entry, "name");
    const parameters = readRecordArray(entry.parameters).map((parameter) => {
      const hasDefault = Object.prototype.hasOwnProperty.call(
        parameter,
        "default",
      );
      const defaultValue = parameter.default;
      if (
        hasDefault &&
        typeof defaultValue !== "string" &&
        typeof defaultValue !== "number"
      ) {
        throw new Error(`${name}: unsupported parameter default`);
      }
      return {
        name: requireString(parameter, "name"),
        required:
          typeof parameter.required === "boolean"
            ? parameter.required
            : !hasDefault,
        ...(hasDefault ? { default: defaultValue } : {}),
      };
    });
    result.set(name, parameters);
  }
  return result;
}

function readTimeExpression(question: string) {
  const compact = question.replace(/\s+/gu, "");
  const relative = compact.match(
    /(?:近|最近)\d+天|本月|上月|本周|上周|今天|昨天/u,
  )?.[0];
  if (relative) return relative;

  const range = compact.match(
    /从(\d{4})年(\d{1,2})月(\d{1,2})日(?:到|至)(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/u,
  );
  if (range) {
    return `${range[1]}年${range[2]}月${range[3]}日 到 ${range[4] ?? range[1]}年${range[5]}月${range[6]}日`;
  }

  return compact.match(/\d{4}年\d{1,2}月\d{1,2}日/u)?.[0];
}

function readProfile(value: unknown) {
  const profile = requireNonEmptyString(value, "capability profile");
  return profile as ToolboxCapabilityProfile;
}

function readYamlObject(path: string) {
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const documents = parseAllDocuments(readFileSync(path, "utf8"));
  if (documents.length !== 1 || documents[0]?.errors.length) {
    throw new Error(`${path} must contain one valid YAML document`);
  }
  const value = documents[0].toJS({ maxAliasCount: 100 }) as unknown;
  if (!isRecord(value)) throw new Error(`${path} must contain an object`);
  return value;
}

function assertResponseType<T extends SemanticQueryResponse["type"]>(
  response: SemanticQueryResponse,
  type: T,
): asserts response is Extract<SemanticQueryResponse, { type: T }> {
  if (response.type !== type) {
    throw new Error(`expected ${type}, received ${response.type}`);
  }
}

function assertQueryId(response: SemanticQueryResponse) {
  if (!/^sq_[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(response.queryId)) {
    throw new Error(`invalid queryId ${JSON.stringify(response.queryId)}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function requireRecord(record: RecordValue, key: string) {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`${key} must be an object`);
  return value;
}

function requireString(record: RecordValue, key: string) {
  return requireNonEmptyString(record[key], key);
}

function requireNonEmptyString(value: unknown, label: string) {
  if (!isNonEmptyString(value)) throw new Error(`${label} must be a string`);
  return value;
}

function readString(value: unknown) {
  return isNonEmptyString(value) ? value : "";
}

function readRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
