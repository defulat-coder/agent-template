# Package-owned Claude filesystem project

> Skill activation by Tool-subset inference is superseded by [ADR 0018](./0018-capability-packed-business-toolbox.md); the package-owned filesystem boundary remains current.

The Claude Agent runtime uses `packages/agent-claude` as its Claude Code project: persistent instructions live in `.claude/CLAUDE.md`, runtime Skills live in `.claude/skills/`, and the SDK runs with the package root as `cwd` plus the `project` setting source. The repository-root `.claude/` remains the authored surface for whole-repository collaboration only; runtime Skills are explicitly filtered because Claude Code also discovers project Skills in ancestor directories.

The Toolbox generator owns `.claude/skills-manifest.json`, which records each generated Skill's required Tools. The runtime enables a Skill only when the selected capability profile exposes its complete Tool set, and validates the package, `CLAUDE.md`, manifest, and enabled Skill files before readiness succeeds or a run starts. `CLAUDE_PROJECT_DIR` is parsed through the runtime configuration interface rather than read as hidden ambient state.

We rejected keeping runtime Skills at the repository root because it merged runtime behavior with monorepo collaboration, and rejected programmatic prompt registration because the official filesystem artifacts should remain inspectable and reusable by both Claude Code and the Agent SDK.
