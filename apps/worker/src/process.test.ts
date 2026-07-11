import { describe, expect, it } from "vitest";
import { createAgentWorkerProcess } from "./process.js";
import type { AgentJobPayload } from "@agent-template/shared";

describe("createAgentWorkerProcess", () => {
  it("assembles worker processing, events, and shutdown behind one interface", async () => {
    const logs: unknown[] = [];
    const payload: AgentJobPayload = {
      runId: "run-1",
    };
    let capturedProcessJob:
      | ((job: {
          id?: string;
          name: string;
          data: AgentJobPayload;
        }) => Promise<unknown>)
      | undefined;
    let capturedOnCompleted:
      | ((job: { id?: string; name: string; data: AgentJobPayload }) => void)
      | undefined;
    let capturedOnFailed:
      | ((
          job: { id?: string; name: string; data: AgentJobPayload } | undefined,
          error: Error,
        ) => void)
      | undefined;
    let closed = false;

    const workerProcess = createAgentWorkerProcess({
      env: {
        REDIS_URL: "redis://localhost:16379",
        AGENT_RUNTIME: "claude",
        AGENT_CAPABILITY_PROFILE: "development-all",
        ANTHROPIC_MODEL: "kimi-for-coding",
        CLAUDE_AGENT_MODEL: "kimi-for-coding",
        EVE_AGENT_MODEL: "kimi-for-coding",
      },
      logger: {
        info(data, message) {
          logs.push(["info", data, message]);
        },
        error(data, message) {
          logs.push(["error", data, message]);
        },
      },
      createWorker({ processJob, onCompleted, onFailed }) {
        capturedProcessJob = processJob;
        capturedOnCompleted = onCompleted;
        capturedOnFailed = onFailed;

        return {
          async close() {
            closed = true;
          },
        };
      },
      async processJob(jobPayload) {
        return {
          promptLength: jobPayload.runId.length,
          runtime: "claude",
          configured: false,
          model: "kimi-for-coding",
          reason: "runtime not configured",
          status: "skipped",
        };
      },
    });

    await expect(
      capturedProcessJob?.({ id: "job-1", name: "agent.run", data: payload }),
    ).resolves.toEqual({
      promptLength: 5,
      runtime: "claude",
      configured: false,
      model: "kimi-for-coding",
      reason: "runtime not configured",
      status: "skipped",
    });
    capturedOnCompleted?.({ id: "job-1", name: "agent.run", data: payload });
    capturedOnFailed?.(undefined, new Error("boom"));
    await workerProcess.close();

    expect(closed).toBe(true);
    expect(logs[0]).toEqual([
      "info",
      { jobId: "job-1", jobName: "agent.run" },
      "processing agent job",
    ]);
    expect(logs[1]).toEqual([
      "info",
      { jobId: "job-1" },
      "agent job completed",
    ]);
    expect(logs[2]).toEqual([
      "error",
      { jobId: undefined, error: expect.any(Error) },
      "agent job failed",
    ]);
  });
});
