import { describe, expect, it } from "vitest";
import { createAgentWorkerRuntime } from "./runtime.js";
import type { AgentJobPayload } from "@agent-template/shared";

describe("createAgentWorkerRuntime", () => {
  it("assembles worker processing, events, and shutdown behind one interface", async () => {
    const logs: unknown[] = [];
    const payload: AgentJobPayload = {
      prompt: "Summarize this template",
      requestedAt: "2026-06-26T00:00:00.000Z"
    };
    let capturedProcessJob:
      | ((job: { id?: string; name: string; data: AgentJobPayload }) => Promise<unknown>)
      | undefined;
    let capturedOnCompleted: ((job: { id?: string; name: string; data: AgentJobPayload }) => void) | undefined;
    let capturedOnFailed:
      | ((job: { id?: string; name: string; data: AgentJobPayload } | undefined, error: Error) => void)
      | undefined;
    let closed = false;

    const runtime = createAgentWorkerRuntime({
      env: { REDIS_URL: "redis://localhost:56379", CLAUDE_AGENT_MODEL: "claude-sonnet-4-5" },
      logger: {
        info(data, message) {
          logs.push(["info", data, message]);
        },
        error(data, message) {
          logs.push(["error", data, message]);
        }
      },
      createWorker({ processJob, onCompleted, onFailed }) {
        capturedProcessJob = processJob;
        capturedOnCompleted = onCompleted;
        capturedOnFailed = onFailed;

        return {
          async close() {
            closed = true;
          }
        };
      },
      async processJob(jobPayload) {
        return {
          accepted: true,
          promptLength: jobPayload.prompt.length,
          claudeConfigured: false,
          model: "claude-sonnet-4-5"
        };
      }
    });

    await expect(capturedProcessJob?.({ id: "job-1", name: "agent.run", data: payload })).resolves.toEqual({
      accepted: true,
      promptLength: 23,
      claudeConfigured: false,
      model: "claude-sonnet-4-5"
    });
    capturedOnCompleted?.({ id: "job-1", name: "agent.run", data: payload });
    capturedOnFailed?.(undefined, new Error("boom"));
    await runtime.close();

    expect(closed).toBe(true);
    expect(logs[0]).toEqual(["info", { jobId: "job-1", jobName: "agent.run" }, "processing agent job"]);
    expect(logs[1]).toEqual(["info", { jobId: "job-1" }, "agent job completed"]);
    expect(logs[2]).toEqual(["error", { jobId: undefined, error: expect.any(Error) }, "agent job failed"]);
  });
});
