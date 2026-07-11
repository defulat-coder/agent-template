import { describe, expect, it } from "vitest";
import { createAgentJobIntake } from "./agent-job-intake.js";

describe("createAgentJobIntake", () => {
  it("validates, enqueues, and closes the Agent job queue", async () => {
    const calls: unknown[] = [];
    const intake = createAgentJobIntake({
      redisUrl: "redis://localhost:16379",
      createQueue: (redisUrl) => {
        calls.push(["createQueue", redisUrl]);

        return {
          name: "agent-jobs",
          async add(name, payload) {
            calls.push(["add", name, payload]);
            return { id: "job-1" };
          },
          async close() {
            calls.push(["close"]);
          },
        };
      },
    });
    const result = await intake.enqueue({
      prompt: "Summarize this template",
      requestedAt: "2026-06-26T00:00:00.000Z",
    });

    expect(result).toEqual({ id: "job-1", queue: "agent-jobs" });
    expect(calls).toEqual([
      ["createQueue", "redis://localhost:16379"],
      [
        "add",
        "agent.run",
        {
          prompt: "Summarize this template",
          requestedAt: "2026-06-26T00:00:00.000Z",
        },
      ],
      ["close"],
    ]);
  });
});
