# Isolated Ecommerce fixture schema

## Status

Accepted.

## Decision

Platform persistence remains in PostgreSQL `public` and is owned by `@agent-template/db`. The deterministic retail validation dataset is owned by `@agent-template/ecommerce-fixture` in the separate `ecommerce_fixture` database schema, with its own Prisma schema, Client, seed, and migration history.

An imperative platform migration moves existing tables and enums with `ALTER ... SET SCHEMA`, preserving data. The fixture package uses Prisma's baseline workflow: existing databases mark its initial migration applied, while the baseline remains sufficient to reconstruct an empty fixture schema. Toolbox SQL schema-qualifies both platform and fixture tables.

## Consequences

- Platform runtime packages do not expose Ecommerce models or import synthetic business data.
- Removing the fixture package and its Toolbox Tools does not require changing Agent run persistence.
- Root database commands still generate, migrate, and seed both modules in dependency order.
- `ECOMMERCE_FIXTURE_DATABASE_URL` may override the fixture connection; otherwise it derives the same database and forces `schema=ecommerce_fixture`.
- Native MCP verification continues to exercise the full deterministic dataset without Docker.
