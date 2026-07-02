import { describe, expect, it } from "vitest";
import { handleAgentJob } from "./job-handler.js";

describe("handleAgentJob", () => {
  it("handles a valid agent job without requiring Claude credentials", async () => {
    const result = await handleAgentJob(
      {
        prompt: "Summarize this template",
        requestedAt: new Date("2026-06-26T00:00:00.000Z").toISOString()
      },
      {}
    );

    expect(result.accepted).toBe(true);
    expect(result.promptLength).toBe(23);
    expect(result.claudeConfigured).toBe(false);
  });

  it("rejects invalid queued payloads at the Worker seam", async () => {
    await expect(handleAgentJob({ prompt: "", requestedAt: "not-a-date" }, {})).rejects.toThrow();
  });
});
