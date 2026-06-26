# Project Template Design

## Goal

Initialize a reusable TypeScript monorepo template with a Next.js web app, a Fastify API, shared packages, local PostgreSQL and Redis infrastructure, and a consistent pnpm/Turborepo developer workflow.

## Architecture

The repository uses a pnpm workspace managed by Turborepo. Runtime applications live in `apps/`, reusable workspace packages live in `packages/`, and local service dependencies are started through Docker Compose.

The template has two applications:

- `apps/web`: Next.js App Router frontend using React, TypeScript, Tailwind CSS, shadcn/ui conventions, and Vitest.
- `apps/api`: Fastify backend using TypeScript, Prisma, PostgreSQL, Redis, BullMQ, Claude Agent SDK integration entry points, Zod validation, Pino logging, and Vitest.

Shared code is split by responsibility:

- `packages/db`: Prisma schema, Prisma Client generation, and database access exports.
- `packages/shared`: Zod schemas and inferred TypeScript types shared across web and API.
- `packages/config`: shared TypeScript, ESLint, and Prettier configuration presets.

## Developer Workflow

The root workspace exposes these commands:

- `pnpm dev`: run web and API development servers through Turborepo.
- `pnpm build`: build all workspace projects.
- `pnpm lint`: run lint checks across all workspace projects.
- `pnpm typecheck`: run TypeScript checks across all workspace projects.
- `pnpm test`: run Vitest across testable workspace projects.
- `pnpm db:generate`: generate Prisma Client from `packages/db/prisma/schema.prisma`.
- `pnpm db:migrate`: run Prisma migrations for local development.

Local infrastructure is included:

- `docker-compose.yml` starts PostgreSQL and Redis.
- `.env.example` documents `DATABASE_URL`, `REDIS_URL`, API host/port, frontend API URL, and Claude API configuration placeholders.

## Frontend Behavior

The frontend starts as a real app shell, not a marketing page. The first screen shows project status from the API health endpoint and basic template metadata. UI copy is concise and suitable for a developer-facing internal template.

The frontend includes:

- App Router structure under `apps/web/app`.
- Tailwind CSS configuration.
- shadcn/ui-compatible component aliases and utility setup.
- A minimal reusable `Button` component matching shadcn/ui patterns.
- A Vitest test for a small UI utility or component behavior.

## Backend Behavior

The backend starts a Fastify server with:

- `GET /health` returning service status, timestamp, database connectivity, Redis connectivity, and queue metadata.
- Pino logger configuration.
- Zod-based environment parsing.
- Prisma Client imported from `@project-template/db`.
- Redis connection setup.
- BullMQ queue setup with a simple typed queue module.
- Claude Agent SDK wrapper module that centralizes future agent calls without baking in business behavior.

The API should boot even when Claude API credentials are absent. Missing Claude credentials are reported as configuration state, not a startup failure.

## Testing

The scaffold includes lightweight tests that prove the workspace is wired correctly:

- API tests cover health response shape without requiring external Claude credentials.
- Shared package tests cover Zod schema parsing and inferred types.
- Web tests cover a component or utility in the Next.js app.

Database and Redis checks are implemented in runtime health logic and documented for local verification through Docker Compose.

## Constraints

- Use pnpm workspaces and Turborepo.
- Use TypeScript throughout.
- Keep generated code minimal and template-oriented.
- Avoid business-domain assumptions.
- Include local PostgreSQL and Redis via Docker Compose.
- Do not require a Claude API key for local boot.
- Keep frontend copy in Chinese where it is user-facing, while preserving technical identifiers such as Next.js, Fastify, Prisma, Redis, BullMQ, and Claude Agent SDK.
