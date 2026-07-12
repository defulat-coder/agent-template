import { strict as assert } from "node:assert";
import { prisma } from "@agent-template/db";

type TableRow = { table_schema: string; table_name: string };

async function main() {
  try {
    const tables = await prisma.$queryRaw<TableRow[]>`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN ('public', 'ecommerce_fixture')
      ORDER BY table_schema, table_name
    `;
    const publicTables = new Set(
      tables
        .filter((table) => table.table_schema === "public")
        .map((table) => table.table_name),
    );
    const fixtureTables = new Set(
      tables
        .filter((table) => table.table_schema === "ecommerce_fixture")
        .map((table) => table.table_name),
    );

    for (const table of ["TemplateEvent", "AgentRun", "AgentRunEvent"]) {
      assert.ok(publicTables.has(table), `public.${table} is missing`);
    }
    assert.equal(
      [...publicTables].some((table) =>
        /^(Ecommerce|Finance|Inventory|Logistics|Marketing|Procurement)/.test(
          table,
        ),
      ),
      false,
      "public schema still contains synthetic business fixture tables",
    );
    for (const table of [
      "EcommerceCustomer",
      "EcommerceProduct",
      "EcommerceOrder",
      "EcommerceOrderItem",
      "EcommercePayment",
      "FinanceRefund",
      "FinanceInvoice",
      "FinanceSettlement",
      "InventoryWarehouse",
      "InventorySnapshot",
      "LogisticsShipment",
      "LogisticsShipmentEvent",
      "ProcurementSupplier",
      "ProcurementOrder",
      "MarketingCampaign",
      "MarketingAttribution",
    ]) {
      assert.ok(
        fixtureTables.has(table),
        `ecommerce_fixture.${table} is missing`,
      );
    }

    const [counts] = await prisma.$queryRaw<
      Array<{
        customers: bigint;
        products: bigint;
        orders: bigint;
        order_items: bigint;
        payments: bigint;
        refunds: bigint;
        invoices: bigint;
        settlements: bigint;
        warehouses: bigint;
        inventory_snapshots: bigint;
        shipments: bigint;
        shipment_events: bigint;
        suppliers: bigint;
        procurement_orders: bigint;
        campaigns: bigint;
        attributions: bigint;
      }>
    >`
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
    `;
    assert.equal(counts?.customers, 96n);
    assert.equal(counts?.products, 24n);
    assert.equal(counts?.orders, 600n);
    assert.equal(counts?.order_items, 1200n);
    assert.equal(counts?.payments, 540n);
    assert.equal(counts?.refunds, 133n);
    assert.equal(counts?.invoices, 480n);
    assert.equal(counts?.settlements, 240n);
    assert.equal(counts?.warehouses, 6n);
    assert.equal(counts?.inventory_snapshots, 8640n);
    assert.equal(counts?.shipments, 480n);
    assert.ok(
      (counts?.shipment_events ?? 0n) >= 480n * 3n,
      "every shipment needs a trace with at least three events",
    );
    assert.equal(counts?.suppliers, 12n);
    assert.equal(counts?.procurement_orders, 180n);
    assert.equal(counts?.campaigns, 12n);
    assert.equal(counts?.attributions, 688n);

    console.log(
      "Database boundary verification passed: platform models remain in public and the deterministic cross-domain business dataset lives only in ecommerce_fixture.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
