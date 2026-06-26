# Project Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable TypeScript monorepo template with Next.js web, Fastify API, shared packages, PostgreSQL, Redis, BullMQ, Prisma, Claude Agent SDK, shadcn/ui-style components, and Vitest.

**Architecture:** Use `apps/web` and `apps/api` for runnable applications. Use `packages/db`, `packages/shared`, and `packages/config` for reusable database, shared schema, and tooling configuration. Use Docker Compose for local PostgreSQL and Redis.

**Tech Stack:** pnpm Workspace, Turborepo, TypeScript, Next.js, React, Tailwind CSS, shadcn/ui conventions, Fastify, Prisma, PostgreSQL, Redis, BullMQ, `@anthropic-ai/claude-agent-sdk`, Zod, Pino, Vitest.

## Global Constraints

- Use pnpm workspaces and Turborepo.
- Use TypeScript throughout.
- Keep generated code minimal and template-oriented.
- Avoid business-domain assumptions.
- Include local PostgreSQL and Redis via Docker Compose.
- Do not require a Claude API key for local boot.
- Keep frontend copy in Chinese where it is user-facing, while preserving technical identifiers such as Next.js, Fastify, Prisma, Redis, BullMQ, and Claude Agent SDK.

---

### Task 1: Root Workspace Foundation

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `README.md`

**Interfaces:**
- Produces: root scripts `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`
- Produces: local services `project_template_postgres` on port `5432` and `project_template_redis` on port `6379`

- [ ] **Step 1: Create root workspace files**

Write root files that define the pnpm workspace, Turborepo pipeline, environment example, Docker Compose services, ignore rules, and README startup commands.

- [ ] **Step 2: Verify root workspace parse**

Run: `pnpm install --lockfile-only`

Expected: `pnpm-lock.yaml` is created and package manifests parse successfully.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .env.example docker-compose.yml README.md pnpm-lock.yaml
git commit -m "chore: add workspace foundation"
```

### Task 2: Shared Configuration Package

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/tsconfig/next.json`
- Create: `packages/config/tsconfig/node.json`
- Create: `packages/config/eslint/base.mjs`
- Create: `packages/config/prettier/base.mjs`

**Interfaces:**
- Produces: TypeScript config paths consumed by app and package `tsconfig.json` files.
- Produces: shared lint and formatting config modules.

- [ ] **Step 1: Create shared config package**

Create focused config files for browser/Next.js projects and Node.js projects.

- [ ] **Step 2: Verify package metadata**

Run: `pnpm --filter @project-template/config typecheck`

Expected: command is skipped or exits successfully because the package contains config only.

- [ ] **Step 3: Commit**

```bash
git add packages/config
git commit -m "chore: add shared tool config"
```

### Task 3: Shared Schema Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/health.ts`
- Create: `packages/shared/src/health.test.ts`

**Interfaces:**
- Produces: `HealthStatusSchema`, `type HealthStatus`, and `createHealthStatus(input)`
- Consumed by: `apps/api` health route and `apps/web` health client

- [ ] **Step 1: Create shared schema package**

Define a Zod health schema with service name, status, timestamp, database, redis, queue, and Claude configuration fields.

- [ ] **Step 2: Run shared tests**

Run: `pnpm --filter @project-template/shared test`

Expected: Vitest passes the schema parsing test.

- [ ] **Step 3: Commit**

```bash
git add packages/shared
git commit -m "feat: add shared health schema"
```

### Task 4: Database Package

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `prisma: PrismaClient`
- Produces: Prisma schema with `TemplateEvent` model
- Consumed by: `apps/api`

- [ ] **Step 1: Create Prisma package**

Create a minimal Prisma schema targeting PostgreSQL and export a singleton Prisma Client.

- [ ] **Step 2: Generate Prisma Client**

Run: `pnpm db:generate`

Expected: Prisma Client generation succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/db
git commit -m "feat: add prisma database package"
```

### Task 5: Fastify API Application

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/env.ts`
- Create: `apps/api/src/logger.ts`
- Create: `apps/api/src/queue.ts`
- Create: `apps/api/src/claude-agent.ts`
- Create: `apps/api/src/health.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/health.test.ts`

**Interfaces:**
- Produces: `buildApp()` returning a Fastify instance.
- Produces: `GET /health` returning `HealthStatus`.
- Consumes: `@project-template/db` and `@project-template/shared`.

- [ ] **Step 1: Create API app files**

Implement environment parsing, logger, Redis/BullMQ queue setup, Claude Agent SDK wrapper, health checks, Fastify app builder, and server entrypoint.

- [ ] **Step 2: Run API tests**

Run: `pnpm --filter @project-template/api test`

Expected: Vitest passes health route tests without requiring Docker services or Claude credentials.

- [ ] **Step 3: Commit**

```bash
git add apps/api
git commit -m "feat: add fastify api app"
```

### Task 6: Next.js Web Application

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/components.json`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/lib/health.ts`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/lib/utils.test.ts`

**Interfaces:**
- Produces: a Next.js app on port `3000`.
- Consumes: API health endpoint from `NEXT_PUBLIC_API_BASE_URL`.
- Uses: shadcn/ui-compatible `Button` and `cn()`.

- [ ] **Step 1: Create web app files**

Implement a Chinese developer-facing dashboard that renders API status and template stack metadata.

- [ ] **Step 2: Run web tests**

Run: `pnpm --filter @project-template/web test`

Expected: Vitest passes utility tests.

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat: add next web app"
```

### Task 7: End-to-End Workspace Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Verifies: Docker Compose services, Prisma generation, workspace tests, type checks, builds, API health route, and web app startup.

- [ ] **Step 1: Install dependencies**

Run: `pnpm install`

Expected: dependencies install and lockfile is current.

- [ ] **Step 2: Start local infrastructure**

Run: `docker compose up -d`

Expected: PostgreSQL and Redis containers are healthy or running.

- [ ] **Step 3: Run verification gates**

Run:

```bash
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands complete successfully.

- [ ] **Step 4: Verify runtime services**

Run:

```bash
pnpm --filter @project-template/api dev
pnpm --filter @project-template/web dev
```

Expected: API serves `http://localhost:4000/health`; web serves `http://localhost:3000`.

- [ ] **Step 5: Update README with verified commands**

Add any command adjustments discovered during verification.

- [ ] **Step 6: Commit**

```bash
git add README.md pnpm-lock.yaml
git commit -m "docs: verify project template startup"
```
