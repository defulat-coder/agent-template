import { randomUUID } from "node:crypto";
import {
  AgentRunEventSchema,
  type AgentRunEvent as SharedAgentRunEvent,
  type AgentRunStatus as SharedAgentRunStatus,
} from "@agent-template/shared";
import { Prisma, type PrismaClient } from "../generated/client/client.js";

const storedRunInclude = {
  events: { orderBy: { sequence: "asc" as const } },
};

const fromPrismaStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
} as const satisfies Record<string, SharedAgentRunStatus>;

export function createPrismaAgentRunRepository(client: PrismaClient) {
  async function find(id: string) {
    const run = await client.agentRun.findUnique({
      where: { id },
      include: storedRunInclude,
    });
    return run ? mapStoredRun(run) : undefined;
  }

  return {
    async create(input: { id: string; prompt: string; requestedAt: Date }) {
      return mapStoredRun(
        await client.agentRun.create({
          data: { ...input, status: "QUEUED" },
          include: storedRunInclude,
        }),
      );
    },
    find,
    async claim(
      id: string,
      input: {
        executionToken: string;
        runtime: "claude" | "eve";
        model: string;
        leaseDurationMs: number;
      },
    ) {
      await client.$executeRaw`
        UPDATE public."AgentRun"
        SET
          status = 'cancelled',
          "completedAt" = clock_timestamp(),
          reason = 'Agent run was cancelled after its execution lease expired',
          "executionToken" = NULL,
          "leaseExpiresAt" = NULL,
          "updatedAt" = clock_timestamp()
        WHERE id = ${id}
          AND status = 'running'
          AND "cancelRequestedAt" IS NOT NULL
          AND "leaseExpiresAt" <= clock_timestamp()
      `;
      const updated = await client.$executeRaw`
        UPDATE public."AgentRun"
        SET
          status = 'running',
          "executionAttempt" = "executionAttempt" + 1,
          "executionToken" = ${input.executionToken},
          "leaseExpiresAt" = clock_timestamp() + (${input.leaseDurationMs} * INTERVAL '1 millisecond'),
          "heartbeatAt" = clock_timestamp(),
          runtime = ${input.runtime},
          model = ${input.model},
          "startedAt" = COALESCE("startedAt", clock_timestamp()),
          "updatedAt" = clock_timestamp()
        WHERE id = ${id}
          AND "cancelRequestedAt" IS NULL
          AND (
            status = 'queued'
            OR (
              status = 'running'
              AND "leaseExpiresAt" <= clock_timestamp()
            )
          )
      `;
      return updated === 1 ? find(id) : undefined;
    },
    async heartbeat(
      id: string,
      input: {
        executionToken: string;
        leaseDurationMs: number;
      },
    ) {
      const updated = await client.$executeRaw`
        UPDATE public."AgentRun"
        SET
          "heartbeatAt" = clock_timestamp(),
          "leaseExpiresAt" = clock_timestamp() + (${input.leaseDurationMs} * INTERVAL '1 millisecond'),
          "updatedAt" = clock_timestamp()
        WHERE id = ${id}
          AND status = 'running'
          AND "executionToken" = ${input.executionToken}
          AND "cancelRequestedAt" IS NULL
          AND "leaseExpiresAt" > clock_timestamp()
      `;
      if (updated === 1) return "active" as const;

      const current = await client.agentRun.findUnique({
        where: { id },
        select: { status: true, executionToken: true, cancelRequestedAt: true },
      });
      return current?.status === "RUNNING" &&
        current.executionToken === input.executionToken &&
        current.cancelRequestedAt
        ? ("cancelled" as const)
        : ("lost" as const);
    },
    async appendExecutionEvent(
      runId: string,
      input: {
        executionToken: string;
        sequence: number;
        event: SharedAgentRunEvent;
        createdAt: Date;
      },
    ) {
      const inserted = await client.$executeRaw`
        INSERT INTO public."AgentRunEvent"
          (id, "runId", sequence, kind, payload, "createdAt")
        SELECT
          ${randomUUID()},
          ${runId},
          ${input.sequence},
          ${input.event.kind},
          ${JSON.stringify(input.event)}::jsonb,
          ${input.createdAt}
        FROM public."AgentRun"
        WHERE id = ${runId}
          AND status = 'running'
          AND "executionToken" = ${input.executionToken}
          AND "leaseExpiresAt" > clock_timestamp()
        ON CONFLICT ("runId", sequence) DO NOTHING
      `;
      return inserted === 1;
    },
    async appendLifecycleEvent(runId: string, input: StoredRunEventInput) {
      const inserted = await client.$executeRaw`
        INSERT INTO public."AgentRunEvent"
          (id, "runId", sequence, kind, payload, "createdAt")
        SELECT
          ${randomUUID()},
          ${runId},
          ${input.sequence},
          ${input.event.kind},
          ${JSON.stringify(input.event)}::jsonb,
          ${input.createdAt}
        FROM public."AgentRun"
        WHERE id = ${runId}
          AND status = 'cancelled'
        ON CONFLICT ("runId", sequence) DO NOTHING
      `;
      if (inserted !== 1) {
        const existing = await client.agentRunEvent.findUnique({
          where: { runId_sequence: { runId, sequence: input.sequence } },
        });
        if (!existing) {
          throw new Error(`Agent run ${runId} lifecycle event was rejected`);
        }
      }
    },
    async finishExecution(
      id: string,
      input: {
        executionToken: string;
        status: Exclude<SharedAgentRunStatus, "queued" | "running">;
        completedAt: Date;
        output?: string;
        reason?: string;
        sessionId?: string;
      },
    ) {
      const updated = await client.$executeRaw`
        UPDATE public."AgentRun"
        SET
          status = ${input.status}::public."AgentRunStatus",
          "completedAt" = ${input.completedAt},
          output = ${input.output ?? null},
          reason = ${input.reason ?? null},
          "sessionId" = ${input.sessionId ?? null},
          "executionToken" = NULL,
          "leaseExpiresAt" = NULL,
          "updatedAt" = clock_timestamp()
        WHERE id = ${id}
          AND status = 'running'
          AND "executionToken" = ${input.executionToken}
          AND "leaseExpiresAt" > clock_timestamp()
      `;
      if (updated !== 1) return undefined;
      const run = await find(id);
      if (!run) throw new Error(`Agent run ${id} was not found`);
      return run;
    },
    async failQueued(id: string, input: { completedAt: Date; reason: string }) {
      await client.agentRun.updateMany({
        where: { id, status: "QUEUED" },
        data: {
          status: "FAILED",
          completedAt: input.completedAt,
          reason: input.reason,
        },
      });
      const run = await find(id);
      if (!run) throw new Error(`Agent run ${id} was not found`);
      return run;
    },
    async requestCancellation(id: string, requestedAt: Date) {
      const cancelled = await client.agentRun.updateMany({
        where: { id, status: "QUEUED" },
        data: {
          status: "CANCELLED",
          cancelRequestedAt: requestedAt,
          completedAt: requestedAt,
          reason: "Agent run was cancelled before execution",
        },
      });
      if (cancelled.count === 0) {
        await client.agentRun.updateMany({
          where: { id, status: "RUNNING" },
          data: { cancelRequestedAt: requestedAt },
        });
      }
      const run = await find(id);
      if (!run) throw new Error(`Agent run ${id} was not found`);
      return run;
    },
  };
}

type StoredRunEventInput = {
  sequence: number;
  event: SharedAgentRunEvent;
  createdAt: Date;
};

function mapStoredRun(
  run: Prisma.AgentRunGetPayload<{ include: typeof storedRunInclude }>,
) {
  return {
    id: run.id,
    prompt: run.prompt,
    requestedAt: run.requestedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    cancelRequestedAt: run.cancelRequestedAt,
    status: fromPrismaStatus[run.status],
    executionAttempt: run.executionAttempt,
    executionToken: run.executionToken,
    leaseExpiresAt: run.leaseExpiresAt,
    heartbeatAt: run.heartbeatAt,
    runtime:
      run.runtime === "claude"
        ? ("claude" as const)
        : run.runtime === "eve"
          ? ("eve" as const)
          : null,
    model: run.model,
    output: run.output,
    reason: run.reason,
    sessionId: run.sessionId,
    events: run.events.map((event) => ({
      sequence: event.sequence,
      event: AgentRunEventSchema.parse(event.payload),
      createdAt: event.createdAt,
    })),
  };
}
