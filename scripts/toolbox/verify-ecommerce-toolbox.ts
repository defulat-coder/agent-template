import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  parseToolboxAgentConfig,
  toolboxToolNames,
} from "@agent-template/toolbox-config";
import { prisma } from "@agent-template/db";
import { startLocalToolbox } from "./local-toolbox-server.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const toolboxConfigPath = fileURLToPath(
  new URL("../../apps/toolbox/tools.yaml", import.meta.url),
);
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://project_template:project_template@localhost:15432/project_template?schema=public";
const timeWindow = {
  from: "2026-06-01T00:00:00Z",
  to: "2026-07-01T00:00:00Z",
};
const verificationRunIds = [
  `toolbox-verify-completed-${process.pid}`,
  `toolbox-verify-failed-${process.pid}`,
];
const verificationNow = new Date();
const agentWindow = {
  from: new Date(verificationNow.getTime() - 86_400_000).toISOString(),
  to: new Date(verificationNow.getTime() + 86_400_000).toISOString(),
};

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}

async function connectClient(toolboxUrl: string) {
  const client = new Client(
    { name: "agent-template-ecommerce-verifier", version: "1.0.0" },
    { capabilities: {} },
  );
  const url = toolboxUrl.endsWith("/mcp")
    ? toolboxUrl
    : `${toolboxUrl.replace(/\/$/, "")}/mcp`;
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport as Parameters<Client["connect"]>[0]);
  return client;
}

async function waitForToolbox(toolboxUrl: string, getLogs = () => "") {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const client = await connectClient(toolboxUrl);
      const tools = await client.listTools();
      if (tools.tools.length > 0) return client;
      await client.close();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `Toolbox did not become ready: ${String(lastError)}\n${getLogs()}`,
  );
}

function hasText(value: unknown): value is { text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string"
  );
}

async function callRows(
  client: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(
    result.isError,
    undefined,
    `${name} returned an MCP error: ${JSON.stringify(result.content)}`,
  );
  return result.content.map((part) => {
    assert.ok(hasText(part));
    return JSON.parse(part.text) as Record<string, unknown>;
  });
}

async function assertToolCallFails(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  expectedMessage: RegExp,
) {
  try {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, `${name} unexpectedly succeeded`);
    assert.match(JSON.stringify(result.content), expectedMessage);
  } catch (error) {
    assert.match(String(error), expectedMessage);
  }
}

async function main() {
  const dockerMode = process.argv.includes("--docker");
  if (dockerMode) run("docker", ["compose", "up", "-d", "postgres", "toolbox"]);
  run("pnpm", ["db:generate"]);
  run("pnpm", ["db:deploy"]);
  run("pnpm", ["db:seed"]);
  await seedAgentRunVerificationData();
  if (dockerMode) {
    run("docker", ["compose", "up", "-d", "--force-recreate", "toolbox"]);
  }

  const localToolbox = dockerMode
    ? undefined
    : await startLocalToolbox({
        configPath: toolboxConfigPath,
        env: {
          TOOLBOX_POSTGRES_DATABASE:
            process.env.TOOLBOX_POSTGRES_DATABASE ?? "project_template",
          TOOLBOX_POSTGRES_HOST:
            process.env.TOOLBOX_POSTGRES_HOST ?? "127.0.0.1",
          TOOLBOX_POSTGRES_PASSWORD:
            process.env.TOOLBOX_POSTGRES_PASSWORD ?? "project_template",
          TOOLBOX_POSTGRES_PORT: process.env.TOOLBOX_POSTGRES_PORT ?? "15432",
          TOOLBOX_POSTGRES_USER:
            process.env.TOOLBOX_POSTGRES_USER ?? "project_template",
        },
      });
  const toolboxUrl =
    localToolbox?.url ?? process.env.TOOLBOX_URL ?? "http://localhost:15000";
  let client: Client | undefined;

  try {
    client = await waitForToolbox(toolboxUrl, localToolbox?.getLogs);
    const liveTools = (await client.listTools()).tools
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(liveTools, [...toolboxToolNames].sort());

    const salesProfile = parseToolboxAgentConfig({
      AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
      TOOLBOX_URL: toolboxUrl,
    });
    assert.deepEqual(salesProfile?.allowedTools, [
      "summarize-ecommerce-sales-by-day",
      "summarize-ecommerce-sales-by-channel",
      "summarize_sales_by_region",
      "summarize_sales_by_customer_segment",
    ]);
    assert.ok(
      !salesProfile?.allowedTools.includes("get-ecommerce-order-detail"),
    );

    const dailySales = await callRows(
      client,
      "summarize-ecommerce-sales-by-day",
      timeWindow,
    );
    assert.equal(dailySales.length, 30);
    assert.equal(dailySales[0]?.salesDate, "2026-06-01T00:00:00Z");
    assert.equal(dailySales[0]?.netSales, 3557.7);

    const emptySales = await callRows(
      client,
      "summarize-ecommerce-sales-by-day",
      { from: "2027-01-01T00:00:00Z", to: "2027-01-02T00:00:00Z" },
    );
    assert.deepEqual(emptySales, []);

    const channelSales = await callRows(
      client,
      "summarize-ecommerce-sales-by-channel",
      timeWindow,
    );
    assert.deepEqual(
      channelSales.map((row) => row.channel),
      ["MARKETPLACE", "MINI_PROGRAM", "LIVE_STREAM", "WEB"],
    );
    assert.equal(channelSales[0]?.netSales, 30262.8);

    const regionSales = await callRows(
      client,
      "summarize_sales_by_region",
      timeWindow,
    );
    assert.equal(regionSales.length, 6);
    const segmentSales = await callRows(
      client,
      "summarize_sales_by_customer_segment",
      timeWindow,
    );
    assert.deepEqual(segmentSales.map((row) => row.customerSegment).sort(), [
      "ACTIVE",
      "AT_RISK",
      "NEW",
      "VIP",
    ]);

    const topProducts = await callRows(client, "list-ecommerce-top-products", {
      ...timeWindow,
      limit: 5,
    });
    assert.equal(topProducts.length, 5);
    assert.equal(topProducts[0]?.sku, "BEAUTY-004");

    const categorySales = await callRows(
      client,
      "summarize_merchandise_by_category",
      timeWindow,
    );
    assert.equal(categorySales.length, 6);

    const orders = await callRows(client, "list-ecommerce-orders-in-window", {
      ...timeWindow,
      limit: 3,
      offset: 0,
    });
    assert.equal(orders.length, 3);
    assert.equal(orders[0]?.orderNumber, "EC20260630010");
    assert.ok(Number(orders[0]?.totalCount) > 3);
    const secondOrders = await callRows(
      client,
      "list-ecommerce-orders-in-window",
      { ...timeWindow, limit: 3, offset: 3 },
    );
    assert.notEqual(secondOrders[0]?.orderNumber, orders[0]?.orderNumber);

    const orderDetail = await callRows(client, "get-ecommerce-order-detail", {
      orderNumber: "EC20260601001",
    });
    assert.equal(orderDetail[0]?.orderNumber, "EC20260601001");
    const partialRefund = await callRows(client, "get-ecommerce-order-detail", {
      orderNumber: "EC20260511008",
    });
    assert.equal(partialRefund[0]?.refundedTotal, 198.8);

    const fulfillment = await callRows(
      client,
      "list-ecommerce-fulfillment-exceptions",
      { ...timeWindow, limit: 3 },
    );
    assert.equal(fulfillment.length, 3);
    assert.equal(fulfillment[0]?.orderNumber, "EC20260601004");

    const agentRuns = await callRows(client, "list-agent-runs", { limit: 100 });
    const completedRun = agentRuns.find(
      (row) => row.runId === verificationRunIds[0],
    );
    assert.equal(completedRun?.status, "completed");
    assert.equal(completedRun?.eventCount, 3);

    const runSummary = await callRows(client, "get-agent-run-summary", {
      runId: verificationRunIds[0],
    });
    assert.equal(runSummary[0]?.prompt, "Verify Toolbox Agent run read model");
    assert.equal(runSummary[0]?.output, "Toolbox read model verified");

    const runTimeline = await callRows(client, "list-agent-run-timeline", {
      runId: verificationRunIds[0],
      limit: 20,
    });
    assert.deepEqual(
      runTimeline.map((row) => row.kind),
      ["tool-call", "tool-result", "done"],
    );
    assert.deepEqual(
      runTimeline.map((row) => row.executionAttempt),
      [1, 1, 1],
    );

    const failedRuns = await callRows(
      client,
      "list-failed-agent-runs-in-window",
      { ...agentWindow, limit: 20 },
    );
    assert.equal(
      failedRuns.find((row) => row.runId === verificationRunIds[1])?.reason,
      "Synthetic verifier failure",
    );

    const toolInvocations = await callRows(
      client,
      "summarize-tool-invocations",
      { ...agentWindow, limit: 20 },
    );
    const invocation = toolInvocations.find(
      (row) => row.toolName === "get-template-event",
    );
    assert.equal(invocation?.invocationCount, 1);
    assert.equal(invocation?.averageLatencyMs, 42);

    await assertToolCallFails(
      client,
      "summarize-ecommerce-sales-by-day",
      {
        from: "2026-06-02T00:00:00Z",
        to: "2026-06-01T00:00:00Z",
      },
      /from < to/i,
    );
    await assertToolCallFails(
      client,
      "summarize-ecommerce-sales-by-day",
      {
        from: "2026-01-01T00:00:00Z",
        to: "2026-03-01T00:00:00Z",
      },
      /31 days/i,
    );

    console.log(
      `Toolbox MCP ${dockerMode ? "Docker" : "local"} verification passed: 18 tools listed, 10 Ecommerce scenarios, and 5 durable Agent run scenarios verified.`,
    );
  } finally {
    await client?.close();
    await localToolbox?.stop();
    await prisma.agentRun.deleteMany({
      where: { id: { in: verificationRunIds } },
    });
    await prisma.$disconnect();
  }
}

async function seedAgentRunVerificationData() {
  await prisma.agentRun.deleteMany({
    where: { id: { in: verificationRunIds } },
  });
  const requestedAt = new Date(verificationNow.getTime() - 60_000);
  const startedAt = new Date(requestedAt.getTime() + 1_000);
  const toolCalledAt = new Date(startedAt.getTime() + 1_000);
  const toolReturnedAt = new Date(toolCalledAt.getTime() + 42);
  const completedAt = new Date(toolReturnedAt.getTime() + 1_000);

  await prisma.agentRun.create({
    data: {
      id: verificationRunIds[0],
      prompt: "Verify Toolbox Agent run read model",
      requestedAt,
      startedAt,
      completedAt,
      status: "COMPLETED",
      executionAttempt: 1,
      runtime: "claude",
      model: "local-verifier",
      output: "Toolbox read model verified",
      events: {
        create: [
          {
            sequence: 0,
            executionAttempt: 1,
            kind: "tool-call",
            payload: {
              kind: "tool-call",
              callId: "call-1",
              toolName: "get-template-event",
              input: { eventId: "evt-1" },
            },
            createdAt: toolCalledAt,
          },
          {
            sequence: 1,
            executionAttempt: 1,
            kind: "tool-result",
            payload: {
              kind: "tool-result",
              callId: "call-1",
              toolName: "get-template-event",
            },
            createdAt: toolReturnedAt,
          },
          {
            sequence: 2,
            executionAttempt: 1,
            kind: "done",
            payload: { kind: "done", result: "Toolbox read model verified" },
            createdAt: completedAt,
          },
        ],
      },
    },
  });

  await prisma.agentRun.create({
    data: {
      id: verificationRunIds[1],
      prompt: "Verify failed Agent run read model",
      requestedAt: new Date(requestedAt.getTime() + 5_000),
      startedAt: new Date(startedAt.getTime() + 5_000),
      completedAt: new Date(completedAt.getTime() + 5_000),
      status: "FAILED",
      runtime: "eve",
      model: "local-verifier",
      reason: "Synthetic verifier failure",
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
