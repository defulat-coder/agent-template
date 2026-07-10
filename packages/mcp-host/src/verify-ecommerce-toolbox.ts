import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpToolboxTimeWindowSchema } from "@agent-template/shared";
import {
  createMcpHost,
  loadMcpHostConfig,
  readAgentCapabilityTools,
} from "./index.js";
import { startLocalToolbox } from "./local-toolbox-server.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const toolboxConfigPath = fileURLToPath(
  new URL("../../../apps/toolbox/tools.yaml", import.meta.url),
);
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://project_template:project_template@localhost:15432/project_template?schema=public";
const expectedToolNames = [
  "get-agent-run-summary",
  "get-ecommerce-order-detail",
  "get-template-event",
  "list-agent-run-timeline",
  "list-agent-runs",
  "list-ecommerce-fulfillment-exceptions",
  "list-ecommerce-orders-in-window",
  "list-ecommerce-top-products",
  "list-failed-agent-runs-in-window",
  "list-template-events-in-window",
  "list-template-events",
  "summarize-ecommerce-sales-by-channel",
  "summarize-ecommerce-sales-by-day",
  "summarize_merchandise_by_category",
  "summarize_sales_by_customer_segment",
  "summarize_sales_by_region",
  "summarize-template-events-by-type",
  "summarize-tool-invocations",
].sort();
const timeWindow = {
  from: "2026-06-01T00:00:00Z",
  to: "2026-07-01T00:00:00Z",
};

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}

function hasText(value: unknown): value is { text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string"
  );
}

function readRows(result: { content: unknown[] }) {
  return result.content.map((part) => {
    assert.ok(hasText(part));
    return JSON.parse(part.text) as Record<string, unknown>;
  });
}

async function listToolboxTools(toolboxUrl: string) {
  const client = new Client(
    { name: "agent-template-ecommerce-verifier", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL(`${toolboxUrl.replace(/\/$/, "")}/mcp`),
  );

  await client.connect(transport as Parameters<Client["connect"]>[0]);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
  }
}

async function waitForToolbox(toolboxUrl: string, getLogs = () => "") {
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const names = await listToolboxTools(toolboxUrl);
      if (names.length > 0) return names;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Toolbox did not become ready: ${String(lastError)}\n${getLogs()}`,
  );
}

async function main() {
  const dockerMode = process.argv.includes("--docker");
  if (dockerMode) {
    run("docker", ["compose", "up", "-d", "postgres", "toolbox"]);
  }
  run("pnpm", ["--filter", "@agent-template/db", "db:generate"]);
  run("pnpm", [
    "--filter",
    "@agent-template/db",
    "exec",
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ]);
  run("pnpm", ["--filter", "@agent-template/db", "db:seed"]);
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

  try {
    assert.deepEqual(
      await waitForToolbox(toolboxUrl, localToolbox?.getLogs),
      expectedToolNames,
    );

    const hostConfig = loadMcpHostConfig({
      AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
      DATABASE_URL: databaseUrl,
      TOOLBOX_URL: toolboxUrl,
    });
    const host = createMcpHost(hostConfig);
    assert.deepEqual(
      (await host.listTools("toolbox")).map((tool) => tool.name).sort(),
      expectedToolNames,
    );

    const dailySales = readRows(
      await host.callTool(
        "toolbox",
        "summarize-ecommerce-sales-by-day",
        timeWindow,
      ),
    );
    assert.equal(dailySales.length, 30);
    assert.equal(dailySales[0]?.salesDate, "2026-06-01T00:00:00Z");
    assert.equal(dailySales[0]?.netSales, 3557.7);

    const utcBoundary = readRows(
      await host.callTool("toolbox", "summarize-ecommerce-sales-by-day", {
        from: "2026-06-01T00:00:00Z",
        to: "2026-06-02T00:00:00Z",
      }),
    );
    assert.equal(utcBoundary.length, 1);
    assert.equal(utcBoundary[0]?.salesDate, "2026-06-01T00:00:00Z");

    const emptySalesResult = await host.callTool(
      "toolbox",
      "summarize-ecommerce-sales-by-day",
      {
        from: "2027-01-01T00:00:00Z",
        to: "2027-01-02T00:00:00Z",
      },
    );
    const emptySales = readRows(emptySalesResult);
    const emptyResult = emptySalesResult.structuredContent?.certifiedQuery as
      | { emptyResult?: { isEmpty?: boolean; suggestions?: string[] } }
      | undefined;
    assert.equal(emptyResult?.emptyResult?.isEmpty, true);
    assert.ok((emptyResult?.emptyResult?.suggestions?.length ?? 0) >= 2);
    assert.deepEqual(emptySales, []);

    const channelSales = readRows(
      await host.callTool(
        "toolbox",
        "summarize-ecommerce-sales-by-channel",
        timeWindow,
      ),
    );
    assert.deepEqual(
      channelSales.map((row) => row.channel),
      ["MARKETPLACE", "MINI_PROGRAM", "LIVE_STREAM", "WEB"],
    );
    assert.equal(channelSales[0]?.paidOrderCount, 60);
    assert.equal(channelSales[0]?.netSales, 30262.8);

    const regionSales = readRows(
      await host.callTool("toolbox", "summarize_sales_by_region", timeWindow),
    );
    assert.equal(regionSales.length, 6);
    assert.ok(regionSales.every((row) => typeof row.region === "string"));
    assert.ok(regionSales.every((row) => typeof row.netSales === "number"));

    const segmentSales = readRows(
      await host.callTool(
        "toolbox",
        "summarize_sales_by_customer_segment",
        timeWindow,
      ),
    );
    assert.deepEqual(segmentSales.map((row) => row.customerSegment).sort(), [
      "ACTIVE",
      "AT_RISK",
      "NEW",
      "VIP",
    ]);
    assert.ok(
      segmentSales.every((row) => typeof row.averageOrderValue === "number"),
    );

    const topProducts = readRows(
      await host.callTool("toolbox", "list-ecommerce-top-products", {
        ...timeWindow,
        limit: 5,
      }),
    );
    assert.equal(topProducts.length, 5);
    assert.equal(topProducts[0]?.sku, "BEAUTY-004");
    assert.equal(topProducts[0]?.netMerchandiseSales, 11607);

    const categorySales = readRows(
      await host.callTool(
        "toolbox",
        "summarize_merchandise_by_category",
        timeWindow,
      ),
    );
    assert.equal(categorySales.length, 6);
    assert.ok(categorySales.every((row) => typeof row.category === "string"));
    assert.ok(
      categorySales.every(
        (row) =>
          typeof row.grossMerchandiseSales === "number" &&
          typeof row.netMerchandiseSales === "number",
      ),
    );

    const orderPageResult = await host.callTool(
      "toolbox",
      "list-ecommerce-orders-in-window",
      {
        ...timeWindow,
        limit: 3,
        offset: 0,
      },
    );
    const orders = readRows(orderPageResult);
    assert.equal(orders.length, 3);
    assert.equal(orders[0]?.orderNumber, "EC20260630010");
    assert.deepEqual(
      (
        orderPageResult.structuredContent?.certifiedQuery as {
          page?: unknown;
        }
      )?.page,
      {
        hasMore: true,
        limit: 3,
        nextOffset: 3,
        offset: 0,
        returnedCount: 3,
      },
    );
    const secondOrderPage = readRows(
      await host.callTool("toolbox", "list-ecommerce-orders-in-window", {
        ...timeWindow,
        limit: 3,
        offset: 3,
      }),
    );
    assert.equal(secondOrderPage.length, 3);
    assert.notEqual(secondOrderPage[0]?.orderNumber, orders[0]?.orderNumber);

    const orderDetail = readRows(
      await host.callTool("toolbox", "get-ecommerce-order-detail", {
        orderNumber: "EC20260601001",
      }),
    );
    assert.equal(orderDetail[0]?.orderNumber, "EC20260601001");
    assert.deepEqual(orderDetail[0]?.items, [
      {
        category: "居家生活",
        discountTotal: 14.9,
        lineTotal: 134.1,
        productName: "香薰扩香礼盒",
        quantity: 1,
        sku: "HOME-003",
        unitPrice: 149,
      },
    ]);

    const partialRefund = readRows(
      await host.callTool("toolbox", "get-ecommerce-order-detail", {
        orderNumber: "EC20260511008",
      }),
    );
    assert.equal(partialRefund[0]?.paidTotal, 497);
    assert.equal(partialRefund[0]?.refundedTotal, 198.8);

    const fulfillmentExceptions = readRows(
      await host.callTool("toolbox", "list-ecommerce-fulfillment-exceptions", {
        ...timeWindow,
        limit: 3,
      }),
    );
    assert.equal(fulfillmentExceptions.length, 3);
    assert.equal(fulfillmentExceptions[0]?.orderNumber, "EC20260601004");
    assert.equal(fulfillmentExceptions[0]?.hoursWaiting, 715.62);

    assert.throws(() =>
      McpToolboxTimeWindowSchema.parse({
        from: "2026-06-02T00:00:00Z",
        to: "2026-06-01T00:00:00Z",
      }),
    );
    assert.ok(
      !readAgentCapabilityTools(hostConfig).includes(
        "get-ecommerce-order-detail",
      ),
    );

    console.log(
      `Ecommerce MCP ${dockerMode ? "Docker" : "local"} verification passed: 18 tools listed, 9 business tools called, and pagination, partial-refund, actionable-empty-result, UTC-boundary, invalid-window, and capability-isolation cases verified.`,
    );
  } finally {
    await localToolbox?.stop();
  }
}

await main();
