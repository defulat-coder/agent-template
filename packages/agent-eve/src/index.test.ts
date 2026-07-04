import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaultEveAgentModel,
  eveAgentDirectory,
  getEveAgentRuntimeStateFromEnv,
  parseEveAgentConfig,
  readEveAgentModel
} from "./index.js";

describe("Eve Agent runtime", () => {
  it("points at the package-local authored surface", () => {
    const state = getEveAgentRuntimeStateFromEnv({});

    expect(state.configured).toBe(false);
    expect(state.authoredSurface).toBe(eveAgentDirectory);
  });

  it("is configured when the Eve Agent host is set", () => {
    const state = getEveAgentRuntimeStateFromEnv({ EVE_AGENT_HOST: "http://127.0.0.1:3000" });

    expect(state.configured).toBe(true);
    expect(state.host).toBe("http://127.0.0.1:3000");
  });

  it("depends on the latest official eve package", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.eve).toBe("latest");
  });

  it("loads the authored surface through eve defineAgent", async () => {
    const agent = (await import("../agent/agent")).default as { model?: string };

    expect(agent.model).toBe(defaultEveAgentModel);
  });

  it("uses one model source for runtime state and authored surface", () => {
    const env = { EVE_AGENT_MODEL: "eve-custom" };

    expect(getEveAgentRuntimeStateFromEnv(env).model).toBe(readEveAgentModel(env));
  });

  it("skips execution until an Eve Agent host is configured", async () => {
    const { runEveAgentJob } = await import("./index.js");

    await expect(runEveAgentJob({ prompt: "Summarize this template" }, parseEveAgentConfig({}))).resolves.toEqual({
      status: "skipped",
      reason: "EVE_AGENT_HOST is not configured"
    });
  });

  it("runs through the Eve client when configured", async () => {
    const { runEveAgentJob } = await import("./index.js");

    await expect(
      runEveAgentJob({ prompt: "Summarize this template" }, parseEveAgentConfig({ EVE_AGENT_HOST: "http://eve.local" }), {
        createClient: () => ({
          session: () => ({
            send: async () => ({
              result: async () => ({
                data: undefined,
                events: [
                  {
                    data: {
                      finishReason: "stop",
                      message: "Done",
                      sequence: 1,
                      stepIndex: 0,
                      turnId: "turn-1"
                    },
                    type: "message.completed"
                  }
                ],
                inputRequests: [],
                message: "Done",
                sessionId: "eve-session-1",
                status: "completed"
              })
            })
          })
        })
      })
    ).resolves.toEqual({
      status: "completed",
      events: [
        {
          data: {
            finishReason: "stop",
            message: "Done",
            sequence: 1,
            stepIndex: 0,
            turnId: "turn-1"
          },
          type: "message.completed"
        }
      ],
      output: "Done",
      sessionId: "eve-session-1"
    });
  });
});
