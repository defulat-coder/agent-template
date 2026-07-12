import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { getEcommerceFixtureDatabaseUrl } from "../src/config.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fullDatabase = process.argv.includes("--full");
const partialDatabase = process.argv.includes("--partial");
const databaseName = `agent_template_fixture_verify_${process.pid}`;
const configuredUrl = new URL(getEcommerceFixtureDatabaseUrl());
const adminUrl = new URL(configuredUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("schema");
const temporaryUrl = new URL(configuredUrl);
temporaryUrl.pathname = `/${databaseName}`;
temporaryUrl.searchParams.set("schema", "ecommerce_fixture");
const platformUrl = new URL(temporaryUrl);
platformUrl.searchParams.set("schema", "public");

async function main() {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();

  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    if (partialDatabase) {
      const fixture = new Client({ connectionString: temporaryUrl.toString() });
      await fixture.connect();
      try {
        await fixture.query(`CREATE SCHEMA ecommerce_fixture`);
        await fixture.query(
          `CREATE TABLE ecommerce_fixture."EcommerceOrder" (id text PRIMARY KEY)`,
        );
      } finally {
        await fixture.end();
      }

      let rejected = false;
      try {
        runPnpm([
          "--filter",
          "@agent-template/ecommerce-fixture",
          "db:migrate",
        ]);
      } catch {
        rejected = true;
      }
      if (!rejected) {
        throw new Error(
          "Partial ecommerce_fixture schema was incorrectly baselined",
        );
      }
      console.log(
        "Partial-database fixture verification passed: incomplete ecommerce_fixture state was rejected before baselining.",
      );
      return;
    }

    if (fullDatabase) {
      runPnpm(["db:deploy"]);
      runPnpm(["db:seed"]);
    } else {
      runPnpm(["--filter", "@agent-template/ecommerce-fixture", "db:migrate"]);
      runPnpm(["--filter", "@agent-template/ecommerce-fixture", "db:seed"]);
    }

    const fixture = new Client({ connectionString: temporaryUrl.toString() });
    await fixture.connect();
    try {
      const result = await fixture.query<{
        attributions: string;
        campaigns: string;
        customers: string;
        invoices: string;
        inventory_snapshots: string;
        products: string;
        orders: string;
        order_items: string;
        payments: string;
        procurement_orders: string;
        refunds: string;
        settlements: string;
        shipment_events: string;
        shipments: string;
        suppliers: string;
        warehouses: string;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM ecommerce_fixture."EcommerceCustomer") AS customers,
          (SELECT COUNT(*) FROM ecommerce_fixture."EcommerceProduct") AS products,
          (SELECT COUNT(*) FROM ecommerce_fixture."EcommerceOrder") AS orders,
          (SELECT COUNT(*) FROM ecommerce_fixture."EcommerceOrderItem") AS order_items,
          (SELECT COUNT(*) FROM ecommerce_fixture."EcommercePayment") AS payments,
          (SELECT COUNT(*) FROM ecommerce_fixture."FinanceRefund") AS refunds,
          (SELECT COUNT(*) FROM ecommerce_fixture."FinanceInvoice") AS invoices,
          (SELECT COUNT(*) FROM ecommerce_fixture."FinanceSettlement") AS settlements,
          (SELECT COUNT(*) FROM ecommerce_fixture."InventoryWarehouse") AS warehouses,
          (SELECT COUNT(*) FROM ecommerce_fixture."InventorySnapshot") AS inventory_snapshots,
          (SELECT COUNT(*) FROM ecommerce_fixture."LogisticsShipment") AS shipments,
          (SELECT COUNT(*) FROM ecommerce_fixture."LogisticsShipmentEvent") AS shipment_events,
          (SELECT COUNT(*) FROM ecommerce_fixture."ProcurementSupplier") AS suppliers,
          (SELECT COUNT(*) FROM ecommerce_fixture."ProcurementOrder") AS procurement_orders,
          (SELECT COUNT(*) FROM ecommerce_fixture."MarketingCampaign") AS campaigns,
          (SELECT COUNT(*) FROM ecommerce_fixture."MarketingAttribution") AS attributions
      `);
      const counts = result.rows[0];
      if (
        !counts ||
        counts.customers !== "96" ||
        counts.products !== "24" ||
        counts.orders !== "600" ||
        counts.order_items !== "1200" ||
        counts.payments !== "540" ||
        counts.refunds !== "133" ||
        counts.invoices !== "480" ||
        counts.settlements !== "240" ||
        counts.warehouses !== "6" ||
        counts.inventory_snapshots !== "8640" ||
        counts.shipments !== "480" ||
        counts.shipment_events !== "1883" ||
        counts.suppliers !== "12" ||
        counts.procurement_orders !== "180" ||
        counts.campaigns !== "12" ||
        counts.attributions !== "688"
      ) {
        throw new Error(
          `Unexpected empty-database fixture counts: ${JSON.stringify(counts)}`,
        );
      }
      if (fullDatabase) {
        const platform = await fixture.query<{ events: string }>(
          `SELECT COUNT(*) AS events FROM public."TemplateEvent"`,
        );
        if (platform.rows[0]?.events !== "13") {
          throw new Error(
            `Unexpected empty-database platform count: ${JSON.stringify(platform.rows[0])}`,
          );
        }
      }
    } finally {
      await fixture.end();
    }

    console.log(
      fullDatabase
        ? "Empty-database migration verification passed: platform and fixture histories rebuilt and seeded both schemas in order."
        : "Empty-database fixture verification passed: isolated migrations rebuilt and seeded ecommerce_fixture without platform migrations.",
    );
  } finally {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await admin.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
    );
    await admin.end();
  }
}

function runPnpm(args: string[]) {
  execFileSync("pnpm", args, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: platformUrl.toString(),
      ECOMMERCE_FIXTURE_DATABASE_URL: temporaryUrl.toString(),
    },
    stdio: "inherit",
  });
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
