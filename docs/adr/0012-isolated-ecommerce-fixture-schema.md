# Isolated Ecommerce fixture schema

## Status

Accepted.

## Decision

Platform persistence remains in PostgreSQL `public` and is owned by `@agent-template/db`. The deterministic retail-operations validation dataset is owned by `@agent-template/ecommerce-fixture` in the separate `ecommerce_fixture` database schema, with its own Prisma schema, Client, seed, and migration history. The package and schema names are compatibility boundaries; the connected synthetic model now also covers finance, logistics, inventory, procurement, and marketing under [ADR 0018](./0018-capability-packed-business-toolbox.md).

An imperative platform migration moves existing tables and enums with `ALTER ... SET SCHEMA`, preserving data. The fixture package uses Prisma's baseline workflow: existing databases mark its initial migration applied, while the baseline remains sufficient to reconstruct an empty fixture schema. Toolbox SQL schema-qualifies both platform and fixture tables.

The fixture migration runner only records the baseline when all five expected business tables already exist. A partial schema is treated as drift and fails closed instead of recording migration state that does not match the database.

## Consequences

- Platform runtime packages do not expose fixture models or import synthetic business data.
- Removing the fixture package and its Toolbox Tools does not require changing Agent run persistence.
- Root database commands still generate, migrate, and seed both modules in dependency order.
- `ECOMMERCE_FIXTURE_DATABASE_URL` may override the fixture connection; otherwise it derives the same database and forces `schema=ecommerce_fixture`.
- Native MCP verification continues to exercise the full deterministic dataset without Docker.
- Empty, complete legacy, and partial-schema paths are verified separately; partial state cannot be baselined automatically.
