# Agent Template Context

Reusable language for the Agent platform template. This glossary names product concepts only; implementation decisions stay in code or ADRs.

## Language

**Agent job**:
A queued request to start an Agent run from a prompt and timestamp.
_Avoid_: Task, queue item

**Agent job intake**:
The act of accepting a requested Agent job into the system and returning acceptance metadata.
_Avoid_: Job route, enqueue helper

**Agent runtime**:
A selectable implementation of Agent behavior. The template may include multiple Agent runtimes, but a deployment chooses one through environment configuration.
_Avoid_: Agent type, Agent mode

**Agent run**:
One execution of an Agent from a prompt through the selected Agent runtime. It may be started by Chat SSE or by a queued Agent job.
_Avoid_: Agent work, job result

**Agent run event**:
An event emitted while an Agent runtime executes an Agent run.
_Avoid_: UI timeline item, log line

**Agent message part**:
One ordered piece of an assistant message, such as text or a folded tool event.
_Avoid_: Timeline item, standalone panel

**Template event**:
A reusable sample event that records Agent platform activity for demos, local verification, and Toolbox inspection.
_Avoid_: Database row, log line

**Ecommerce fixture**:
A deterministic, synthetic retail dataset for Toolbox functional validation. It contains no real customer or transaction data.
_Avoid_: Production export, random demo data

**Ecommerce order**:
A synthetic retail order with customer segment, channel, payment, fulfillment state, and order lines. Refunds may be full or partial.
_Avoid_: Template event, Agent run

**Business semantic catalog**:
A versioned mapping from business terms to certified metrics, dimensions, value mappings, and approved query paths. It makes the meaning of a business question explicit without exposing raw tables to an Agent.
_Avoid_: Prompt glossary, table dictionary

**Semantic query**:
A structured analytical request whose metric, dimensions, filters, and time window are selected from a Business semantic catalog. It does not mean arbitrary natural-language SQL.
_Avoid_: Raw SQL, unrestricted NL2SQL

**Tool provider**:
An external capability source that exposes tools an Agent run may use.
_Avoid_: Agent runtime, app service

**Toolbox server**:
A Tool provider backed by MCP Toolbox for Databases.
_Avoid_: Database helper, embedded database client

**Toolbox toolset**:
A named group of Toolbox server tools that an Agent runtime may load for a specific Agent capability.
_Avoid_: Runtime plugin, database permission set

**Agent capability profile**:
A deployment-selected, named subset of Toolbox server tools that an Agent runtime presents to the model for one business role. It narrows model-visible capabilities but does not replace Toolbox authentication or database authorization.
_Avoid_: User-selected mode, authorization policy

**MCP Client**:
A protocol client owned by one Agent runtime that maintains a connection to a Tool provider. Claude and Eve use their framework-native MCP Client implementations.
_Avoid_: Shared MCP Host, Tool provider

**Claude Agent runtime**:
A Claude Agent SDK backed Agent runtime.
_Avoid_: Cloud runtime, Claude path

**Eve Agent runtime**:
A filesystem-first Agent runtime shaped by Eve's authored surface.
_Avoid_: Eve-style runtime, Eve clone, file runtime
