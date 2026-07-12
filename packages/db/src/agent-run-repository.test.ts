import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/client/client.js";
import { createPrismaAgentRunRepository } from "./agent-run-repository.js";

describe("Prisma Agent run repository", () => {
  it("observes only events after the requested sequence without loading history", async () => {
    const createdAt = new Date("2026-07-12T00:00:00.000Z");
    const findUnique = vi.fn(async () => ({
      id: "run-1",
      status: "RUNNING" as const,
      events: [
        {
          sequence: 4,
          executionAttempt: 2,
          payload: { kind: "text", text: "new" },
          createdAt,
        },
      ],
    }));
    const repository = createPrismaAgentRunRepository({
      agentRun: { findUnique },
    } as unknown as PrismaClient);

    await expect(repository.observe("run-1", 3)).resolves.toEqual({
      id: "run-1",
      status: "running",
      events: [
        {
          sequence: 4,
          executionAttempt: 2,
          event: { kind: "text", text: "new" },
          createdAt,
        },
      ],
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "run-1" },
      select: {
        id: true,
        status: true,
        events: {
          where: { sequence: { gt: 3 } },
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
  });

  it("commits a queued cancellation event with its terminal transition", async () => {
    const requestedAt = new Date("2026-07-12T00:00:00.000Z");
    const reason = "Agent run was cancelled before execution";
    const withoutEvent = prismaRun({
      cancelRequestedAt: requestedAt,
      completedAt: requestedAt,
      reason,
      status: "CANCELLED",
    });
    const withEvent = {
      ...withoutEvent,
      events: [cancelledEvent(requestedAt, reason)],
    };
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(withoutEvent)
      .mockResolvedValueOnce(withEvent);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const executeRaw = vi.fn().mockResolvedValue(1);
    const transaction = {
      $executeRaw: executeRaw,
      agentRun: { findUnique, updateMany },
    };
    const repository = createPrismaAgentRunRepository({
      $transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaClient);

    await expect(
      repository.requestCancellation("run-1", requestedAt),
    ).resolves.toMatchObject({
      status: "cancelled",
      events: [
        {
          sequence: 0,
          executionAttempt: null,
          event: { kind: "cancelled", reason },
        },
      ],
    });
    expect(updateMany).toHaveBeenCalledOnce();
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("commits the cancellation event while finalizing an expired lease", async () => {
    const completedAt = new Date("2026-07-12T00:00:11.000Z");
    const reason = "Agent run was cancelled after its execution lease expired";
    const withoutEvent = prismaRun({
      cancelRequestedAt: new Date("2026-07-12T00:00:05.000Z"),
      completedAt,
      reason,
      status: "CANCELLED",
    });
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(withoutEvent)
      .mockResolvedValueOnce({
        ...withoutEvent,
        events: [cancelledEvent(completedAt, reason)],
      });
    const executeRaw = vi.fn().mockResolvedValue(1);
    const transaction = { $executeRaw: executeRaw, agentRun: { findUnique } };
    const repository = createPrismaAgentRunRepository({
      $transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaClient);

    await expect(
      repository.claim("run-1", {
        executionToken: "execution-2",
        runtime: "claude",
        model: "test-model",
        leaseDurationMs: 10_000,
      }),
    ).resolves.toBeUndefined();
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

function prismaRun(
  overrides: Partial<{
    cancelRequestedAt: Date | null;
    completedAt: Date | null;
    reason: string | null;
    status: "CANCELLED" | "QUEUED" | "RUNNING";
  }> = {},
) {
  const requestedAt = new Date("2026-07-12T00:00:00.000Z");
  return {
    id: "run-1",
    conversationId: null,
    prompt: "Test run",
    inputResponses: null,
    requestedAt,
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    status: "QUEUED" as const,
    executionAttempt: 0,
    executionToken: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    runtime: null,
    model: null,
    output: null,
    reason: null,
    runtimeSessionId: null,
    createdAt: requestedAt,
    updatedAt: requestedAt,
    events: [],
    ...overrides,
  };
}

function cancelledEvent(createdAt: Date, reason: string) {
  return {
    id: "event-cancelled",
    runId: "run-1",
    sequence: 0,
    executionAttempt: null,
    kind: "cancelled",
    payload: { kind: "cancelled", reason },
    createdAt,
  };
}
