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

**Template event**:
A reusable sample event that records Agent platform activity for demos, local verification, and Toolbox inspection.
_Avoid_: Database row, log line

**Tool provider**:
An external capability source that exposes tools an Agent run may use.
_Avoid_: Agent runtime, app service

**Toolbox server**:
A Tool provider backed by MCP Toolbox for Databases.
_Avoid_: Database helper, embedded database client

**Toolbox toolset**:
A named group of Toolbox server tools that an Agent runtime may load for a specific Agent capability.
_Avoid_: Runtime plugin, database permission set

**MCP Host**:
The user-facing AI application that manages MCP server connections, presents chat, and renders MCP Apps or other interactive MCP outputs.
_Avoid_: MCP server, Tool provider

**MCP Client**:
A protocol client owned by an MCP Host or Agent runtime that maintains one connection to one MCP Server.
_Avoid_: Web page, Agent runtime

**Structured Agent UI**:
A structured, streamable UI artifact emitted during an Agent run so tabular or report-like data can be rendered inside Chat while the normal text answer remains available.
_Avoid_: Dashboard page, hard-coded report

**Claude Agent runtime**:
A Claude Agent SDK backed Agent runtime.
_Avoid_: Cloud runtime, Claude path

**Eve Agent runtime**:
A filesystem-first Agent runtime shaped by Eve's authored surface.
_Avoid_: Eve-style runtime, Eve clone, file runtime
