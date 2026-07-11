import { describe, expect, it } from "vitest";
import { AgentJobAcceptedSchema } from "./agent-job";

describe("AgentJobAcceptedSchema", () => {
  it("accepts Agent job intake metadata", () => {
    expect(
      AgentJobAcceptedSchema.parse({ id: "job-1", queue: "agent-jobs" }),
    ).toEqual({
      id: "job-1",
      queue: "agent-jobs",
    });
  });

  it("allows BullMQ to omit a job id", () => {
    expect(
      AgentJobAcceptedSchema.parse({ id: undefined, queue: "agent-jobs" }),
    ).toEqual({
      id: undefined,
      queue: "agent-jobs",
    });
  });
});
