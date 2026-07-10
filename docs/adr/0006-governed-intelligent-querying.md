# Govern intelligent querying through a semantic catalog and certified Toolbox Tools

## Status

Accepted

## Context

The template needs to answer business questions expressed with domain terms such as GMV, VIP customer, livestream, and fulfillment backlog. Exposing raw PostgreSQL tables or arbitrary SQL to an Agent would make metric definitions drift between prompts and would let model-controlled input cross the data-access seam.

## Decision

Use a versioned Business semantic catalog per domain to map business terms, metrics, dimensions, value mappings, ambiguity rules, and question patterns to certified Toolbox Tools. The current PostgreSQL implementation uses outcome-focused, prepared-statement Tools and Agent Skills that load the catalog on demand. Trusted identity, tenant scope, and authorization remain outside model-controlled arguments and must be enforced by the Host and database.

Do not introduce arbitrary NL2SQL in the PostgreSQL template. A future semantic query compiler may support higher-dimensional combinations only through catalog allowlists and parameterized SQL. AlloyDB AI NL remains an optional, separate migration path because it requires AlloyDB `nl_config` and its own security configuration.

The implementation hierarchy is normative:

1. Certified outcome-focused business query Tools are the default for stable critical user journeys.
2. A semantic query compiler needs an ADR and may accept only a structured, catalog-backed query request; it cannot accept SQL, table names, column names, free expressions, or model-controlled identity scope.
3. An external semantic layer is selected when several BI and AI consumers need one source of truth for metrics and relationships; Toolbox must call that governed model rather than duplicate formulas.
4. Database-native NL2SQL is a separate AlloyDB migration. Its `nl_config`, Parameterized Secure Views, and authenticated or bound identity parameters are mandatory rather than prompt-level conventions.

Toolsets remain context and Skill-generation groups, not authorization. Host capability profiles must exist before a deployment claims per-Agent least-privilege Tool visibility.

## Consequences

- Metrics and business values receive one reviewed, versioned definition.
- Claude and Eve share the same business vocabulary without directly connecting to the database.
- Every new Tool must be referenced by the catalog, Host allowlist, Agent adapter, generated Skill, and semantic golden cases.
- The previous requirement applies to certified business query Tools; platform read-only operational Tools instead require bounded inputs, annotations, Host allowlisting, and native execution verification.
- Every analytical Tool documents a business timezone, `[from, to)` interval, and compatible database time type; no Tool may depend on an implicit database session timezone.
- Free-form combinations beyond the certified query catalog require an intentional compiler or AlloyDB migration, not prompt-only SQL generation.
