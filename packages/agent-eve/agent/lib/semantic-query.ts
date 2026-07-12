import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createSemanticQueryEngine,
  SemanticQueryExecutionError,
  SemanticQueryProposalSchema,
  type ExecuteSemanticTool,
  type SemanticQueryEngineOptions,
} from "@agent-template/semantic-query";
import {
  resolveToolboxSemanticCatalogs,
  type ToolboxAgentConfig,
} from "@agent-template/toolbox-config";
import { readEveToolboxConfig } from "./capability-profile";

export const EveSemanticQueryToolInputSchema = SemanticQueryProposalSchema.pick(
  {
    catalog: true,
    intent: true,
    terms: true,
    timeExpression: true,
  },
)
  .extend({ question: z.string().trim().min(1) })
  .strict();

export type EveSemanticQueryToolInput = z.infer<
  typeof EveSemanticQueryToolInputSchema
>;

type EveSemanticQueryMcpClient = Pick<
  McpClient,
  "callTool" | "close" | "connect"
>;

export type CreateEveSemanticQueryRuntimeOptions = {
  catalogs?: readonly unknown[];
  createClient?: () => EveSemanticQueryMcpClient;
  executeTool?: ExecuteSemanticTool;
  now?: SemanticQueryEngineOptions["now"];
  nowMs?: () => number;
  resolveCatalogs?: (
    profile: ToolboxAgentConfig["capabilityProfile"],
  ) => readonly unknown[];
};

export function isEveSemanticQueryEnabled(
  input: Record<string, unknown> = process.env,
) {
  return Boolean(readEveToolboxConfig(input)?.semanticCatalogs.length);
}

export function createEveSemanticQueryRuntime(
  input: Record<string, unknown> = process.env,
  options: CreateEveSemanticQueryRuntimeOptions = {},
) {
  const toolbox = readEveToolboxConfig(input);
  if (!toolbox?.semanticCatalogs.length) return undefined;

  const catalogs =
    options.catalogs ??
    (options.resolveCatalogs ?? resolveToolboxSemanticCatalogs)(
      toolbox.capabilityProfile,
    );
  const engine = createSemanticQueryEngine({
    allowedTools: toolbox.semanticExecutionTools,
    catalogs,
    executeTool:
      options.executeTool ??
      createEveToolboxExecutor(toolbox, {
        ...(options.createClient ? { createClient: options.createClient } : {}),
      }),
    now: options.now ?? (() => new Date()),
  });
  const nowMs = options.nowMs ?? Date.now;

  return {
    async query(
      input_: EveSemanticQueryToolInput,
      queryOptions: { signal?: AbortSignal | undefined } = {},
    ) {
      const parsed = EveSemanticQueryToolInputSchema.parse(input_);
      const startedAt = nowMs();
      const response = await engine.query(
        {
          question: parsed.question,
          proposal: {
            ...(parsed.catalog ? { catalog: parsed.catalog } : {}),
            ...(parsed.intent ? { intent: parsed.intent } : {}),
            ...(parsed.terms ? { terms: parsed.terms } : {}),
            ...(parsed.timeExpression
              ? { timeExpression: parsed.timeExpression }
              : {}),
          },
        },
        queryOptions,
      );
      return {
        ...response,
        durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
      };
    },
  };
}

export function createEveToolboxExecutor(
  config: ToolboxAgentConfig,
  options: { createClient?: () => EveSemanticQueryMcpClient } = {},
): ExecuteSemanticTool {
  return async (toolName, arguments_, executeOptions) => {
    const client = (options.createClient ?? createEveSemanticQueryMcpClient)();
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: {
        ...(config.authorizationToken
          ? {
              headers: {
                Authorization: `Bearer ${config.authorizationToken}`,
              },
            }
          : {}),
        ...(executeOptions?.signal ? { signal: executeOptions.signal } : {}),
      },
    });
    let executionError: unknown;
    let rows: unknown[] | undefined;

    try {
      await client.connect(
        transport as Parameters<EveSemanticQueryMcpClient["connect"]>[0],
      );
      const result = await client.callTool(
        { name: toolName, arguments: { ...arguments_ } },
        undefined,
        executeOptions?.signal ? { signal: executeOptions.signal } : {},
      );
      rows = parseToolboxRows(toolName, result);
    } catch (error) {
      executionError = error;
    }

    let closeError: unknown;
    try {
      await client.close();
    } catch (error) {
      closeError = error;
    }

    if (executionError !== undefined && closeError !== undefined) {
      throw new AggregateError(
        [executionError, closeError],
        `Eve semantic query failed while executing ${toolName} and closing its Toolbox MCP Client`,
        { cause: executionError },
      );
    }
    if (executionError !== undefined) throw executionError;
    if (closeError !== undefined) throw closeError;
    if (!rows) {
      throw new Error(
        `Eve semantic query ${toolName} completed without rows or an execution error`,
      );
    }
    return rows;
  };
}

function createEveSemanticQueryMcpClient(): EveSemanticQueryMcpClient {
  return new McpClient(
    { name: "agent-template-eve-semantic-query", version: "1.0.0" },
    { capabilities: {} },
  );
}

function parseToolboxRows(toolName: string, result: unknown): unknown[] {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new SemanticQueryExecutionError(
      `Certified Toolbox Tool ${toolName} returned an invalid MCP result`,
    );
  }
  if (result.isError === true) {
    throw new SemanticQueryExecutionError(
      `Certified Toolbox Tool ${toolName} failed: ${JSON.stringify(result.content)}`,
    );
  }

  return result.content.map((part, index) => {
    if (
      !isRecord(part) ||
      part.type !== "text" ||
      typeof part.text !== "string"
    ) {
      throw new SemanticQueryExecutionError(
        `Certified Toolbox Tool ${toolName} returned non-text content at index ${index}`,
      );
    }
    try {
      return JSON.parse(part.text) as unknown;
    } catch (cause) {
      throw new SemanticQueryExecutionError(
        `Certified Toolbox Tool ${toolName} returned invalid JSON at index ${index}`,
        { cause },
      );
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
