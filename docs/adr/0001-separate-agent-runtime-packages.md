# Separate Agent Runtime Packages

The template includes both a Claude Agent runtime and an Eve Agent runtime, but a deployment chooses one runtime through `AGENT_RUNTIME`. We keep the implementations in separate workspace packages (`packages/agent-claude` and `packages/agent-eve`) and reserve `packages/agent` for the shared runtime contract and selection boundary, so dependencies and authored surfaces stay independent while API and Worker code depend on one stable Agent boundary.

Within `packages/agent-eve`, the package root is the Eve app root and `agent/` follows Eve's recommended nested layout. Permanent instructions, supported least-privilege default Tool overrides, Skills, Connections, Channel auth, and the portable `justbash()` sandbox stay inside that package-owned authored surface. The runtime pins the portable JavaScript sandbox instead of selecting a Docker or VM backend because packaged Skill references need only an isolated virtual filesystem.

Toolbox connection Tools and generated business Skills resolve from the same deployment capability profile. Eve Skills use its official dynamic Skill resolver at `session.started`, so a model is not shown a procedure unless every Tool required by that procedure is visible. The HTTP channel accepts service tokens or verified Vercel OIDC in deployments; `localDev()` is appended only for uncredentialed non-production loopback development. Credential-bearing Eve Clients reject redirects.

We rejected a root-level `agent/` directory because it represents a single Eve-style app more than a reusable monorepo package, and we rejected putting both implementations in `packages/agent` because that would hide runtime-specific dependencies behind one package name.
