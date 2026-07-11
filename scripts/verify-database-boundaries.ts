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
      [...publicTables].some((table) => table.startsWith("Ecommerce")),
      false,
      "public schema still contains Ecommerce fixture tables",
    );
    for (const table of [
      "EcommerceCustomer",
      "EcommerceProduct",
      "EcommerceOrder",
      "EcommerceOrderItem",
      "EcommercePayment",
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
      }>
    >`
      SELECT
        (SELECT COUNT(*) FROM ecommerce_fixture."EcommerceCustomer") AS customers,
        (SELECT COUNT(*) FROM ecommerce_fixture."EcommerceProduct") AS products,
        (SELECT COUNT(*) FROM ecommerce_fixture."EcommerceOrder") AS orders,
        (SELECT COUNT(*) FROM ecommerce_fixture."EcommerceOrderItem") AS order_items,
        (SELECT COUNT(*) FROM ecommerce_fixture."EcommercePayment") AS payments
    `;
    assert.deepEqual(counts, {
      customers: 96n,
      products: 24n,
      orders: 600n,
      order_items: 1200n,
      payments: 540n,
    });

    console.log(
      "Database boundary verification passed: platform models remain in public and the deterministic Ecommerce dataset lives only in ecommerce_fixture.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
