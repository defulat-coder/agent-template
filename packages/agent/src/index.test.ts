import { describe, expect, it } from "vitest";
import {
  defaultAgentRuntimeName,
  defaultClaudeAgentModel,
  defaultEveAgentModel,
  getAgentRuntimeStateFromEnv,
  parseAgentRuntimeEnv,
  runAgentJob
} from "./index.js";

describe("Agent runtime selector", () => {
  it("defaults to the Claude Agent runtime", () => {
    const state = getAgentRuntimeStateFromEnv({});

    expect(state.runtime).toBe(defaultAgentRuntimeName);
    expect(state.configured).toBe(false);
    expect(state.model).toBe(defaultClaudeAgentModel);
  });

  it("selects the Eve Agent runtime from AGENT_RUNTIME", () => {
    const state = getAgentRuntimeStateFromEnv({ AGENT_RUNTIME: "eve" });

    expect(state.runtime).toBe("eve");
    expect(state.configured).toBe(false);
  });

  it("keeps runtime-specific env config behind the Agent runtime env interface", () => {
    expect(parseAgentRuntimeEnv({})).toMatchObject({
      AGENT_RUNTIME: defaultAgentRuntimeName,
      CLAUDE_AGENT_MODEL: defaultClaudeAgentModel,
      EVE_AGENT_MODEL: defaultEveAgentModel
    });

    expect(
      getAgentRuntimeStateFromEnv({
        AGENT_RUNTIME: "eve",
        EVE_AGENT_HOST: "http://127.0.0.1:3000",
        EVE_AGENT_MODEL: "eve-custom"
      })
    ).toMatchObject({
      runtime: "eve",
      configured: true,
      model: "eve-custom"
    });
  });

  it("runs an Agent job through the selected Agent runtime seam", async () => {
    await expect(
      runAgentJob(
        {
          prompt: "Summarize this template",
          requestedAt: "2026-06-26T00:00:00.000Z"
        },
        { AGENT_RUNTIME: "eve", EVE_AGENT_HOST: "http://127.0.0.1:3000", EVE_AGENT_MODEL: "eve-custom" },
        {
          runEve: async () => ({
            status: "completed",
            events: [{ type: "message.completed" }],
            output: "Done",
            sessionId: "eve-session-1"
          })
        }
      )
    ).resolves.toEqual({
      accepted: true,
      promptLength: 23,
      runtime: "eve",
      configured: true,
      model: "eve-custom",
      status: "completed",
      events: [{ type: "message.completed" }],
      output: "Done",
      sessionId: "eve-session-1"
    });
  });

  it("rejects invalid Agent job payloads at the Agent runtime seam", async () => {
    await expect(runAgentJob({ prompt: "", requestedAt: "not-a-date" }, {})).rejects.toThrow();
  });
});
