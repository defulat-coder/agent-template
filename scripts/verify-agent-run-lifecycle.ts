import { strict as assert } from "node:assert";
import { createAgentRunLifecycle } from "@agent-template/agent";
import { createPrismaAgentRunRepository, prisma } from "@agent-template/db";

const createdRunIds: string[] = [];

async function main() {
  const repository = createPrismaAgentRunRepository(prisma);
  const lifecycle = createAgentRunLifecycle({
    repository,
    async execute(input, _env, options) {
      options.onEvent?.({ kind: "text", text: "Working" });
      options.onEvent?.({ kind: "done", result: "Done" });
      return {
        configured: true,
        events: [
          { kind: "text", text: "Working" },
          { kind: "done", result: "Done" },
        ],
        model: "local-verifier",
        output: "Done",
        promptLength: (input as { prompt: string }).prompt.length,
        runtime: "claude",
        status: "completed",
      };
    },
  });

  try {
    const queued = await lifecycle.queue({ prompt: "Verify persisted run" });
    createdRunIds.push(queued.id);
    assert.equal(queued.status, "queued");

    const completed = await lifecycle.resume(queued.id, {
      AGENT_RUNTIME: "claude",
      CLAUDE_AGENT_MODEL: "local-verifier",
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.runId, queued.id);

    const stored = await lifecycle.get(queued.id);
    assert.equal(stored?.status, "completed");
    assert.equal(stored?.output, "Done");
    assert.deepEqual(stored?.events, [
      { kind: "text", text: "Working" },
      { kind: "done", result: "Done" },
    ]);

    const cancelled = await lifecycle.queue({ prompt: "Cancel before run" });
    createdRunIds.push(cancelled.id);
    const cancellation = await lifecycle.cancel(cancelled.id);
    assert.equal(cancellation?.status, "cancelled");
    assert.ok(cancellation?.cancelRequestedAt);
    assert.deepEqual(cancellation?.events, [
      {
        kind: "cancelled",
        reason: "Agent run was cancelled before execution",
      },
    ]);
    await assert.doesNotReject(() => lifecycle.resume(cancelled.id, {}));

    const recoverable = await lifecycle.queue({
      prompt: "Recover crashed run",
    });
    createdRunIds.push(recoverable.id);
    const firstClaim = await repository.claim(recoverable.id, {
      executionToken: "local-verifier-execution-1",
      runtime: "claude",
      model: "local-verifier",
      leaseDurationMs: 100,
    });
    assert.equal(firstClaim?.executionAttempt, 1);
    const earlyClaim = await repository.claim(recoverable.id, {
      executionToken: "local-verifier-execution-2",
      runtime: "claude",
      model: "local-verifier",
      leaseDurationMs: 2_000,
    });
    assert.equal(earlyClaim, undefined);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(
      await repository.heartbeat(recoverable.id, {
        executionToken: "local-verifier-execution-1",
        leaseDurationMs: 2_000,
      }),
      "lost",
    );
    const reclaimed = await repository.claim(recoverable.id, {
      executionToken: "local-verifier-execution-2",
      runtime: "claude",
      model: "local-verifier",
      leaseDurationMs: 2_000,
    });
    assert.equal(reclaimed?.executionAttempt, 2);
    assert.equal(
      await repository.appendExecutionEvent(recoverable.id, {
        executionToken: "local-verifier-execution-1",
        sequence: 0,
        event: { kind: "text", text: "stale" },
        createdAt: new Date("2000-01-01T00:00:00.000Z"),
      }),
      false,
    );
    assert.equal(
      await repository.finishExecution(recoverable.id, {
        executionToken: "local-verifier-execution-1",
        status: "completed",
        completedAt: new Date("2099-01-01T00:00:00.000Z"),
        output: "stale",
      }),
      undefined,
    );
    assert.equal(
      await repository.appendExecutionEvent(recoverable.id, {
        executionToken: "local-verifier-execution-2",
        sequence: 0,
        event: { kind: "done", result: "recovered" },
        createdAt: new Date("2099-01-01T00:00:00.000Z"),
      }),
      true,
    );
    const recovered = await repository.finishExecution(recoverable.id, {
      executionToken: "local-verifier-execution-2",
      status: "completed",
      completedAt: new Date("2099-01-01T00:00:00.000Z"),
      output: "recovered",
    });
    assert.equal(recovered?.status, "completed");
    assert.equal(recovered?.executionAttempt, 2);
    assert.equal(recovered?.events[0]?.event.kind, "done");
    assert.equal(recovered?.events[0]?.executionAttempt, 2);

    const cancelledCrash = await lifecycle.queue({
      prompt: "Cancel crashed execution",
    });
    createdRunIds.push(cancelledCrash.id);
    await repository.claim(cancelledCrash.id, {
      executionToken: "local-verifier-cancelled-execution",
      runtime: "claude",
      model: "local-verifier",
      leaseDurationMs: 100,
    });
    await repository.requestCancellation(cancelledCrash.id, new Date());
    await new Promise((resolve) => setTimeout(resolve, 120));
    const finalizedCancellation = await lifecycle.resume(cancelledCrash.id, {});
    assert.equal(finalizedCancellation.status, "cancelled");
    assert.equal(finalizedCancellation.events[0]?.kind, "cancelled");

    console.log(
      "Local Agent run lifecycle verification passed: persistence, cancellation, expired-lease reclaim, stale-executor fencing, event attempt provenance, and crashed-run cancellation.",
    );
  } finally {
    await prisma.agentRun.deleteMany({ where: { id: { in: createdRunIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
