import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { getEcommerceFixtureDatabaseUrl } from "../src/config.js";

const baseline = "0_ecommerce_fixture_baseline";
const requiredBusinessTables = [
  "EcommerceCustomer",
  "EcommerceProduct",
  "EcommerceOrder",
  "EcommerceOrderItem",
  "EcommercePayment",
] as const;
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const prismaPackageJson = require.resolve("prisma/package.json");
const prismaPackage = require(prismaPackageJson) as {
  bin: { prisma: string };
};
const prismaCli = join(dirname(prismaPackageJson), prismaPackage.bin.prisma);

async function main() {
  const client = new Client({
    connectionString: getEcommerceFixtureDatabaseUrl(),
  });
  await client.connect();

  try {
    const businessTables = await client.query<{ tablename: string }>(
      `SELECT tablename
       FROM pg_catalog.pg_tables
       WHERE schemaname = 'ecommerce_fixture'
         AND tablename = ANY($1::text[])
       ORDER BY tablename`,
      [[...requiredBusinessTables]],
    );
    const migrationsTable = await client.query<{
      table_name: string | null;
    }>(
      `SELECT to_regclass('ecommerce_fixture."_prisma_migrations"')::text AS table_name`,
    );
    const baselineApplied = migrationsTable.rows[0]?.table_name
      ? await client.query<{ applied: boolean }>(
          `SELECT EXISTS (
             SELECT 1
             FROM ecommerce_fixture."_prisma_migrations"
             WHERE migration_name = $1 AND finished_at IS NOT NULL
           ) AS applied`,
          [baseline],
        )
      : undefined;

    const existingTables = new Set(
      businessTables.rows.map((row) => row.tablename),
    );
    if (
      existingTables.size > 0 &&
      existingTables.size < requiredBusinessTables.length
    ) {
      const missingTables = requiredBusinessTables.filter(
        (table) => !existingTables.has(table),
      );
      throw new Error(
        `Refusing to baseline partial ecommerce_fixture schema; missing tables: ${missingTables.join(", ")}`,
      );
    }

    if (
      existingTables.size === requiredBusinessTables.length &&
      !baselineApplied?.rows[0]?.applied
    ) {
      runPrisma(["migrate", "resolve", "--applied", baseline]);
    }
  } finally {
    await client.end();
  }

  runPrisma(["migrate", "deploy"]);
}

function runPrisma(args: string[]) {
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: packageRoot,
    env: process.env,
    stdio: "inherit",
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
