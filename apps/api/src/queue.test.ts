import { describe, expect, it } from "vitest";
import { defaultAgentRunLeaseDurationMs } from "@agent-template/agent";
import { createAgentJobRetryPolicy } from "./queue.js";

describe("Agent job retry policy", () => {
  it("delays every BullMQ retry beyond the active execution lease", () => {
    const policy = createAgentJobRetryPolicy();

    expect(policy).toEqual({
      attempts: 3,
      backoff: {
        type: "fixed",
        delay: defaultAgentRunLeaseDurationMs + 5_000,
      },
    });
    expect(policy.backoff.delay).toBeGreaterThan(
      defaultAgentRunLeaseDurationMs,
    );
  });
});
