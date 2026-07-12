import { randomUUID } from "node:crypto";
import {
  AgentConversationBusyError,
  AgentInputResponseSchema,
  AgentRunEventSchema,
  type AgentInputResponse,
  type AgentRunListQuery,
  type AgentRunEvent as SharedAgentRunEvent,
  type AgentRunStatus as SharedAgentRunStatus,
} from "@agent-template/shared";
import { Prisma, type PrismaClient } from "../generated/client/client.js";

const storedRunInclude = {
  events: { orderBy: { sequence: "asc" as const } },
};
type PrismaStoredAgentRun = Prisma.AgentRunGetPayload<{
  include: typeof storedRunInclude;
}>;
const AgentInputResponsesSchema = AgentInputResponseSchema.array();

const fromPrismaStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  WAITING: "waiting",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
} as const satisfies Record<string, SharedAgentRunStatus>;

const toPrismaStatus = {
  queued: "QUEUED",
  running: "RUNNING",
  waiting: "WAITING",
  completed: "COMPLETED",
  failed: "FAILED",
  skipped: "SKIPPED",
  cancelled: "CANCELLED",
} as const;

export function createPrismaAgentRunRepository(client: PrismaClient) {
  async function find(id: string) {
    const run = await client.agentRun.findUnique({
      where: { id },
      include: storedRunInclude,
    });
    return run ? mapStoredRun(run) : undefined;
  }

  return {
    async create(input: {
      id: string;
      prompt: string;
      inputResponses?: AgentInputResponse[];
      requestedAt: Date;
      conversationId?: string;
    }) {
      try {
        return mapStoredRun(
          await client.agentRun.create({
            data: { ...input, status: "QUEUED" },
            include: storedRunInclude,
          }),
        );
      } catch (error) {
        if (input.conversationId && isActiveConversationConflict(error)) {
          throw new AgentConversationBusyError(input.conversationId, {
            cause: error,
          });
        }
        throw error;
      }
    },
    find,
    async observe(id: string, afterSequence: number) {
      const run = await client.agentRun.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          events: {
            where: { sequence: { gt: afterSequence } },
            orderBy: { sequence: "asc" },
            select: {
              sequence: true,
              executionAttempt: true,
              payload: true,
              createdAt: true,
            },
          },
        },
      });
      return run
        ? {
            id: run.id,
            status: fromPrismaStatus[run.status],
            events: run.events.map(mapStoredRunEvent),
          }
        : undefined;
    },
    async list(input: AgentRunListQuery) {
      const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
      const where = {
        ...(input.conversationId
          ? { conversationId: input.conversationId }
          : {}),
        ...(input.runtime ? { runtime: input.runtime } : {}),
        ...(input.status?.length
          ? {
              status: {
                in: input.status.map((status) => toPrismaStatus[status]),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { requestedAt: { lt: cursor.requestedAt } },
                {
                  requestedAt: cursor.requestedAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      } satisfies Prisma.AgentRunWhereInput;
      const runs = await client.agentRun.findMany({
        where,
        include: storedRunInclude,
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasNext = runs.length > input.limit;
      const items = runs.slice(0, input.limit);
      const last = items.at(-1);
      return {
        items: items.map(mapStoredRun),
        nextCursor:
          hasNext && last
            ? encodeCursor({ requestedAt: last.requestedAt, id: last.id })
            : null,
      };
    },
    async claim(
      id: string,
      input: {
        executionToken: string;
        runtime: "claude" | "eve";
        model: string;
        leaseDurationMs: number;
      },
    ) {
      return client.$transaction(async (transaction) => {
        const expiredCancellationReason =
          "Agent run was cancelled after its execution lease expired";
        const cancelled = await transaction.$executeRaw`
          UPDATE public."AgentRun"
          SET
            status = 'cancelled',
            "completedAt" = clock_timestamp(),
            reason = ${expiredCancellationReason},
            "executionToken" = NULL,
            "leaseExpiresAt" = NULL,
            "updatedAt" = clock_timestamp()
          WHERE id = ${id}
            AND status = 'running'
            AND "cancelRequestedAt" IS NOT NULL
            AND "leaseExpiresAt" <= clock_timestamp()
        `;
        if (cancelled === 1) {
          const run = await findStoredRun(transaction, id);
          if (!run) throw new Error(`Agent run ${id} was not found`);
          await appendTerminalCancellationEvent(
            transaction,
            run,
            expiredCancellationReason,
          );
          return undefined;
        }

        const updated = await transaction.$executeRaw`
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
        if (updated !== 1) return undefined;
        const run = await findStoredRun(transaction, id);
        if (!run) throw new Error(`Agent run ${id} was not found`);
        return mapStoredRun(run);
      });
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
          (id, "runId", sequence, "executionAttempt", kind, payload, "createdAt")
        SELECT
          ${randomUUID()},
          ${runId},
          ${input.sequence},
          "executionAttempt",
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
          (id, "runId", sequence, "executionAttempt", kind, payload, "createdAt")
        SELECT
          ${randomUUID()},
          ${runId},
          ${input.sequence},
          NULL,
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
        runtimeSessionId?: string;
        runtimeContinuation?: unknown;
      },
    ) {
      return client.$transaction(async (transaction) => {
        const updated = await transaction.$executeRaw`
          UPDATE public."AgentRun"
          SET
            status = ${input.status}::public."AgentRunStatus",
            "completedAt" = ${input.completedAt},
            output = ${input.output ?? null},
            reason = ${input.reason ?? null},
            "runtimeSessionId" = ${input.runtimeSessionId ?? null},
            "executionToken" = NULL,
            "leaseExpiresAt" = NULL,
            "updatedAt" = clock_timestamp()
          WHERE id = ${id}
            AND status = 'running'
            AND "executionToken" = ${input.executionToken}
            AND "leaseExpiresAt" > clock_timestamp()
        `;
        if (updated !== 1) return undefined;
        if (input.runtimeContinuation) {
          await transaction.$executeRaw`
            UPDATE public."AgentConversation" AS conversation
            SET
              "runtimeContinuationState" = ${JSON.stringify(input.runtimeContinuation)}::jsonb,
              "updatedAt" = clock_timestamp()
            FROM public."AgentRun" AS run
            WHERE run.id = ${id}
              AND run."conversationId" = conversation.id
              AND conversation.runtime = ${readContinuationRuntime(input.runtimeContinuation)}
          `;
        }
        const run = await transaction.agentRun.findUnique({
          where: { id },
          include: storedRunInclude,
        });
        if (!run) throw new Error(`Agent run ${id} was not found`);
        return mapStoredRun(run);
      });
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
      return client.$transaction(async (transaction) => {
        const queuedCancellationReason =
          "Agent run was cancelled before execution";
        const cancelled = await transaction.agentRun.updateMany({
          where: { id, status: "QUEUED" },
          data: {
            status: "CANCELLED",
            cancelRequestedAt: requestedAt,
            completedAt: requestedAt,
            reason: queuedCancellationReason,
          },
        });
        if (cancelled.count === 1) {
          const run = await findStoredRun(transaction, id);
          if (!run) throw new Error(`Agent run ${id} was not found`);
          const updated = await appendTerminalCancellationEvent(
            transaction,
            run,
            queuedCancellationReason,
          );
          return mapStoredRun(updated);
        }

        await transaction.agentRun.updateMany({
          where: { id, status: "RUNNING" },
          data: { cancelRequestedAt: requestedAt },
        });
        const run = await findStoredRun(transaction, id);
        if (!run) throw new Error(`Agent run ${id} was not found`);
        return mapStoredRun(run);
      });
    },
  };
}

async function appendTerminalCancellationEvent(
  transaction: Prisma.TransactionClient,
  run: PrismaStoredAgentRun,
  reason: string,
): Promise<PrismaStoredAgentRun> {
  if (run.events.some((event) => event.kind === "cancelled")) return run;
  if (!run.completedAt) {
    throw new Error(
      `Agent run ${run.id} cannot persist a terminal cancellation event without completedAt`,
    );
  }
  const event = { kind: "cancelled", reason } satisfies SharedAgentRunEvent;
  const inserted = await transaction.$executeRaw`
    INSERT INTO public."AgentRunEvent"
      (id, "runId", sequence, "executionAttempt", kind, payload, "createdAt")
    SELECT
      ${randomUUID()},
      ${run.id},
      ${run.events.length},
      NULL,
      ${event.kind},
      ${JSON.stringify(event)}::jsonb,
      ${run.completedAt}
    FROM public."AgentRun"
    WHERE id = ${run.id}
      AND status = 'cancelled'
    ON CONFLICT ("runId", sequence) DO NOTHING
  `;
  if (inserted !== 1) {
    throw new Error(
      `Agent run ${run.id} terminal cancellation event was rejected`,
    );
  }
  const updated = await findStoredRun(transaction, run.id);
  if (!updated) throw new Error(`Agent run ${run.id} was not found`);
  return updated;
}

function findStoredRun(client: Prisma.TransactionClient, id: string) {
  return client.agentRun.findUnique({
    where: { id },
    include: storedRunInclude,
  });
}

type StoredRunEventInput = {
  sequence: number;
  event: SharedAgentRunEvent;
  createdAt: Date;
};

function mapStoredRun(run: PrismaStoredAgentRun) {
  return {
    id: run.id,
    conversationId: run.conversationId,
    prompt: run.prompt,
    inputResponses: parseStoredAgentInputResponses(run.id, run.inputResponses),
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
    runtimeSessionId: run.runtimeSessionId,
    events: run.events.map(mapStoredRunEvent),
  };
}

function mapStoredRunEvent(event: {
  sequence: number;
  executionAttempt: number | null;
  payload: unknown;
  createdAt: Date;
}) {
  return {
    sequence: event.sequence,
    executionAttempt: event.executionAttempt,
    event: AgentRunEventSchema.parse(event.payload),
    createdAt: event.createdAt,
  };
}

function parseStoredAgentInputResponses(runId: string, input: unknown) {
  if (input === null) return null;
  const parsed = AgentInputResponsesSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new Error(`Agent run ${runId} has invalid persisted inputResponses`, {
    cause: parsed.error,
  });
}

function encodeCursor(input: { requestedAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({
      requestedAt: input.requestedAt.toISOString(),
      id: input.id,
    }),
  ).toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.requestedAt !== "string" ||
      typeof parsed.id !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    const requestedAt = new Date(parsed.requestedAt);
    if (Number.isNaN(requestedAt.getTime())) throw new Error("invalid cursor");
    return { requestedAt, id: parsed.id };
  } catch {
    throw new Error("Agent run cursor is invalid");
  }
}

function readContinuationRuntime(input: unknown) {
  if (
    typeof input === "object" &&
    input !== null &&
    "runtime" in input &&
    (input.runtime === "claude" || input.runtime === "eve")
  ) {
    return input.runtime;
  }
  throw new Error("Agent runtime continuation is invalid");
}

function isActiveConversationConflict(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return (
    (Array.isArray(target) && target.includes("conversationId")) ||
    target === "AgentRun_one_active_per_conversation_idx" ||
    error.message.includes("AgentRun_one_active_per_conversation_idx") ||
    error.message.includes("conversationId")
  );
}
