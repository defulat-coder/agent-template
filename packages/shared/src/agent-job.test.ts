import { describe, expect, it } from "vitest";
import { AgentJobAcceptedSchema, AgentJobPayloadSchema } from "./agent-job";

describe("AgentJobAcceptedSchema", () => {
  it("accepts Agent job intake metadata", () => {
    expect(
      AgentJobAcceptedSchema.parse({ id: "job-1", queue: "agent-jobs" }),
    ).toEqual({
      id: "job-1",
      queue: "agent-jobs",
    });
  });

  it("requires the durable Agent run id", () => {
    expect(() =>
      AgentJobAcceptedSchema.parse({ id: undefined, queue: "agent-jobs" }),
    ).toThrow();
  });

  it("keeps BullMQ payload limited to the durable Agent run reference", () => {
    expect(
      AgentJobPayloadSchema.parse({
        runId: "run-1",
        prompt: "must remain in PostgreSQL",
        requestedAt: "2026-07-11T00:00:00.000Z",
      }),
    ).toEqual({ runId: "run-1" });
  });
});
