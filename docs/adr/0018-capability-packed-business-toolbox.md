# Compile business Capability Packs into Toolbox and runtime Skills

The project keeps one isolated, deterministic synthetic business dataset in the
existing PostgreSQL `ecommerce_fixture` schema. The physical schema name is a
compatibility detail: the fixture now models a connected retail operation across
commerce, orders, finance, logistics, inventory, procurement, and marketing. It
contains no real customer, supplier, payment, or shipment data.

Business Agent capabilities are authored as Capability Packs. A Pack owns one
task-level Toolbox Toolset, its production Tool scope, an official generated
Agent Skill, a governed semantic catalog, and the complete Tool list required by
that Skill. Agent capability profiles compose whole Packs; they do not maintain
an independent list of Tools or infer Skills from a partial Tool set.

The shared Toolbox configuration module compiles a selected profile into one
activation containing `allowedTools`, `enabledSkills`, and `scopes`. Claude and
Eve remain separate runtime adapters: each uses its framework-native MCP Client,
applies the compiled Tool allowlist, and activates exactly the compiled Skills.
Business data stays in PostgreSQL and is read through Toolbox MCP; only the
Skill instructions and the Pack's semantic catalog are delivered to the Agent.

The repository generator invokes the official Toolbox `skills-generate`
command for every Pack, preserves its raw output, and adapts that output to the
Claude filesystem project and Eve dynamic Skill surfaces. A generated manifest
records the Pack-to-Tool contract so drift checks can validate the authored
configuration, Toolbox Toolsets, semantic query contracts, capability profiles,
and both runtime surfaces together.

Each production-facing Tool is a bounded, read-only, outcome-focused prepared
query. Toolsets stay task-sized rather than exposing the full synthetic schema.
`development-all` and the aggregate `business-operations` profile are explicit
development or demonstration choices and are rejected when a Toolbox Bearer
token is configured. Production deployments select a narrower role profile and
still rely on Toolbox OIDC scopes and PostgreSQL permissions for authorization.

We rejected table-level CRUD, arbitrary SQL/NL2SQL, copying fixture records into
Skills, a shared runtime MCP Host, and one mega business Toolset. Those options
either expose storage details, enlarge model context, duplicate authorization,
or erase the existing Claude/Eve adapter seam. We also keep the physical schema
and package names for now because renaming an isolated synthetic namespace adds
migration risk without improving the Agent interface.

This decision supersedes the Tool-subset-to-Skill inference described in
[ADR 0015](./0015-package-owned-claude-filesystem-project.md). The package-owned
Claude filesystem project itself remains unchanged.
