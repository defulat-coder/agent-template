import { describe, expect, it } from "vitest";
import { AgentRunResultSchema } from "./agent-run";

describe("AgentRunResultSchema", () => {
  it("accepts completed Agent runs with run events", () => {
    expect(
      AgentRunResultSchema.parse({
        configured: true,
        events: [{ kind: "done", result: "Done" }],
        model: "kimi-for-coding",
        output: "Done",
        promptLength: 9,
        runtime: "claude",
        status: "completed",
      }),
    ).toEqual({
      configured: true,
      events: [{ kind: "done", result: "Done" }],
      model: "kimi-for-coding",
      output: "Done",
      promptLength: 9,
      runtime: "claude",
      status: "completed",
    });
  });
});
