import { describe, expect, it } from "vitest";
import { defaultClaudeAgentModel, getAgentConfigStateFromEnv } from "./index.js";

describe("agent config", () => {
  it("does not require an Anthropic API key", () => {
    const state = getAgentConfigStateFromEnv({});

    expect(state.configured).toBe(false);
    expect(state.model).toBe(defaultClaudeAgentModel);
  });
});
