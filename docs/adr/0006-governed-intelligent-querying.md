# Govern intelligent querying through a semantic catalog and certified Toolbox Tools

## Status

Accepted

## Context

The template needs to answer business questions expressed with domain terms such as GMV, VIP customer, livestream, and fulfillment backlog. Exposing raw PostgreSQL tables or arbitrary SQL to an Agent would make metric definitions drift between prompts and would let model-controlled input cross the data-access seam.

## Decision

Use a versioned Business semantic catalog per domain to map business terms, metrics, dimensions, value mappings, ambiguity rules, and question patterns to certified Toolbox Tools. The current PostgreSQL implementation uses outcome-focused, prepared-statement Tools and Agent Skills that load the catalog on demand. Trusted identity, tenant scope, and authorization remain outside model-controlled arguments and must be enforced by the Host and database.

Do not introduce arbitrary NL2SQL in the PostgreSQL template. A future semantic query compiler may support higher-dimensional combinations only through catalog allowlists and parameterized SQL. AlloyDB AI NL remains an optional, separate migration path because it requires AlloyDB `nl_config` and its own security configuration.

## Consequences

- Metrics and business values receive one reviewed, versioned definition.
- Claude and Eve share the same business vocabulary without directly connecting to the database.
- Every new Tool must be referenced by the catalog, Host allowlist, Agent adapter, generated Skill, and semantic golden cases.
- Free-form combinations beyond the certified query catalog require an intentional compiler or AlloyDB migration, not prompt-only SQL generation.
