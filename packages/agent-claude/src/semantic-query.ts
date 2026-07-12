import { z } from "zod";
import type { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  createSemanticQueryEngine,
  readSemanticQueryFailureMetadata,
  SemanticQueryExecutionError,
  SemanticQueryProposalSchema,
} from "@agent-template/semantic-query";
import {
  resolveToolboxSemanticCatalogs,
  type ToolboxAgentConfig,
} from "@agent-template/toolbox-config";
import type { AgentRunEvent } from "@agent-template/shared";

export const claudeSemanticQueryServerName = "semantic_query";
export const claudeSemanticQueryToolName = "query_business_data";
export const claudeSemanticQueryAllowedTool = `mcp__${claudeSemanticQueryServerName}__${claudeSemanticQueryToolName}`;

export const ClaudeSemanticQueryToolInputSchema =
  SemanticQueryProposalSchema.pick({
    catalog: true,
    intent: true,
    terms: true,
    timeExpression: true,
  })
    .extend({ question: z.string().trim().min(1) })
    .strict();

export type ClaudeSemanticQueryToolInput = z.infer<
  typeof ClaudeSemanticQueryToolInputSchema
>;

export type ClaudeSemanticQueryToolHandler = (
  input: ClaudeSemanticQueryToolInput,
  extra?: unknown,
) => Promise<CallToolResult>;

type ClaudeSemanticQueryMcpClient = {
  callTool(
    input: {
      name: string;
      arguments: Record<string, unknown>;
    },
    resultSchema?: undefined,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
  close(): Promise<void>;
};

export type CreateClaudeSemanticQueryMcpServerOptions = {
  catalogs?: readonly unknown[];
  connectToolbox?: (
    config: ToolboxAgentConfig,
    signal?: AbortSignal,
  ) => Promise<ClaudeSemanticQueryMcpClient>;
  createServer: typeof createSdkMcpServer;
  defineTool: typeof tool;
  now?: () => Date;
  nowMs?: () => number;
};

export function createClaudeSemanticQueryMcpServer(
  config: ToolboxAgentConfig,
  options: CreateClaudeSemanticQueryMcpServerOptions,
) {
  const catalogs =
    options.catalogs ??
    resolveToolboxSemanticCatalogs(config.capabilityProfile);
  if (catalogs.length === 0) {
    throw new Error(
      `Toolbox capability profile ${config.capabilityProfile} does not enable semantic catalogs`,
    );
  }

  const handler: ClaudeSemanticQueryToolHandler = async (input, extra) => {
    const parsed = ClaudeSemanticQueryToolInputSchema.parse(input);
    const signal = readAbortSignal(extra);
    let client: ClaudeSemanticQueryMcpClient | undefined;
    let executionError: unknown;
    let toolResult: CallToolResult | undefined;
    const nowMs = options.nowMs ?? Date.now;
    const startedAt = nowMs();

    const engine = createSemanticQueryEngine({
      allowedTools: config.semanticExecutionTools,
      catalogs,
      now: options.now ?? (() => new Date()),
      async executeTool(toolName, arguments_, executeOptions) {
        client ??= await (options.connectToolbox ?? connectToolbox)(
          config,
          executeOptions?.signal,
        );
        const result = await client.callTool(
          { name: toolName, arguments: { ...arguments_ } },
          undefined,
          executeOptions?.signal ? { signal: executeOptions.signal } : {},
        );
        return parseToolboxRows(toolName, result);
      },
    });

    try {
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
        { signal },
      );
      const result = {
        ...response,
        durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
      };
      toolResult = {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      executionError = error;
    }

    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        if (executionError !== undefined) {
          throw new AggregateError(
            [executionError, closeError],
            "Claude semantic query failed while executing and closing its Toolbox MCP Client",
            { cause: closeError },
          );
        }
        throw closeError;
      }
    }
    if (executionError !== undefined) throw executionError;
    if (!toolResult) {
      throw new Error("Claude semantic query Tool produced no result");
    }
    return toolResult;
  };

  const semanticQueryTool = options.defineTool(
    claudeSemanticQueryToolName,
    "将业务问题解析为受治理的语义查询；仅执行认证查询契约，并返回口径、限制与可追溯结果。",
    ClaudeSemanticQueryToolInputSchema.shape,
    handler,
    {
      alwaysLoad: true,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    },
  );

  return options.createServer({
    name: claudeSemanticQueryServerName,
    version: "1.0.0",
    instructions:
      "业务问数只使用 query_business_data。不要直接调用底层业务 Toolbox Tool，也不要提交 SQL、表名、列名、身份或权限信息。",
    tools: [semanticQueryTool],
  });
}

export function readClaudeSemanticQueryEvent(
  callId: string,
  content: unknown,
): Extract<AgentRunEvent, { kind: "semantic-query" }> {
  const response = parseSemanticToolResponse(content);
  if (typeof response.queryId !== "string" || !response.queryId) {
    throw new Error(
      `Claude semantic query Tool result ${callId} is missing queryId`,
    );
  }
  const durationMs = readSemanticQueryDurationMs(response.durationMs, callId);

  const base = {
    kind: "semantic-query" as const,
    callId,
    queryId: response.queryId,
    status: response.type,
    ...(durationMs === undefined ? {} : { durationMs }),
  };
  if (response.type !== "result") return base;
  if (!isRecord(response.plan)) {
    throw new Error(
      `Claude semantic query Tool result ${callId} is missing its plan`,
    );
  }

  const plan = response.plan;
  if (
    typeof plan.catalog !== "string" ||
    !plan.catalog ||
    !isCatalogVersion(plan.catalogVersion) ||
    typeof plan.contract !== "string" ||
    !plan.contract ||
    typeof plan.tool !== "string" ||
    !plan.tool ||
    typeof response.planHash !== "string" ||
    !response.planHash ||
    typeof response.rowCount !== "number" ||
    !Number.isSafeInteger(response.rowCount) ||
    response.rowCount < 0
  ) {
    throw new Error(
      `Claude semantic query Tool result ${callId} has invalid provenance metadata`,
    );
  }
  return {
    ...base,
    catalog: plan.catalog,
    catalogVersion: plan.catalogVersion,
    contractId: plan.contract,
    toolName: plan.tool,
    planHash: response.planHash,
    rowCount: response.rowCount,
  };
}

export function readClaudeSemanticQueryFailureEvent(
  callId: string,
  content: unknown,
): Extract<AgentRunEvent, { kind: "semantic-query" }> | undefined {
  const text = readClaudeToolResultText(content);
  if (text === undefined) return undefined;
  const metadata = readSemanticQueryFailureMetadata(text);
  if (!metadata) return undefined;
  return {
    kind: "semantic-query",
    callId,
    status: "failed",
    queryId: metadata.queryId,
    planHash: metadata.planHash,
    stage: metadata.stage,
    toolName: metadata.tool,
  };
}

function readSemanticQueryDurationMs(
  value: unknown,
  callId: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Claude semantic query Tool result ${callId} has invalid durationMs`,
    );
  }
  return value;
}

async function connectToolbox(
  config: ToolboxAgentConfig,
  signal?: AbortSignal,
): Promise<ClaudeSemanticQueryMcpClient> {
  const client = new McpClient(
    { name: "agent-template-claude-semantic-query", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      ...(config.authorizationToken
        ? { headers: { Authorization: `Bearer ${config.authorizationToken}` } }
        : {}),
      ...(signal ? { signal } : {}),
    },
  });

  try {
    await client.connect(transport as Parameters<McpClient["connect"]>[0]);
    return client;
  } catch (error) {
    try {
      await client.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Claude semantic query failed to connect and close its Toolbox MCP Client",
        { cause: closeError },
      );
    }
    throw error;
  }
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

function readAbortSignal(extra: unknown): AbortSignal | undefined {
  if (
    typeof extra === "object" &&
    extra !== null &&
    "signal" in extra &&
    extra.signal instanceof AbortSignal
  ) {
    return extra.signal;
  }
  return undefined;
}

function parseSemanticToolResponse(content: unknown): SemanticToolResponse {
  const text = readClaudeToolResultText(content);
  if (typeof text !== "string") {
    throw new Error("Claude semantic query Tool returned no JSON text content");
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      isRecord(parsed) &&
      (parsed.type === "clarification" ||
        parsed.type === "unsupported" ||
        parsed.type === "result")
    ) {
      return parsed as SemanticToolResponse;
    }
  } catch (cause) {
    throw new Error("Claude semantic query Tool returned invalid JSON", {
      cause,
    });
  }
  throw new Error(
    "Claude semantic query Tool returned an invalid response type",
  );
}

function readClaudeToolResultText(content: unknown): string | undefined {
  return typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.find(
          (part) =>
            isRecord(part) &&
            part.type === "text" &&
            typeof part.text === "string",
        )?.text
      : undefined;
}

type SemanticToolResponse = Record<string, unknown> & {
  type: "clarification" | "result" | "unsupported";
};

function isCatalogVersion(value: unknown): value is string | number {
  return (
    (typeof value === "string" && value.length > 0) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
