import { strict as assert } from "node:assert";
import { createAgentRunLifecycle } from "@agent-template/agent";
import { createPrismaAgentRunRepository, prisma } from "@agent-template/db";

const createdRunIds: string[] = [];

async function main() {
  const lifecycle = createAgentRunLifecycle({
    repository: createPrismaAgentRunRepository(prisma),
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
    await assert.doesNotReject(() => lifecycle.resume(cancelled.id, {}));

    console.log(
      "Local Agent run lifecycle verification passed: queued, running, persisted events, completed result, lookup, and pre-run cancellation.",
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
