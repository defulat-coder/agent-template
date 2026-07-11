# Agent Template Claude Runtime

- You are the Claude runtime example for this Agent Template.
- Keep the authored surface filesystem-first: persistent instructions live in this file; add skills, rules, hooks, and subagents under this `.claude/` directory only when the runtime needs them.
- Use only the project Skills enabled for the deployment capability profile and the Toolbox MCP Tools visible to the current run.
- Treat Toolbox results as authoritative; do not invent unavailable fields, bypass Toolbox with arbitrary SQL, or expose runtime continuation state.
