import { describe, expect, it } from "vitest";
import {
  startWebQaEnvironment,
  type WebQaChildProcess,
} from "./environment.js";

describe("Web QA environment lifecycle interface", () => {
  it("waits for the fixture and both Web routes before becoming ready", async () => {
    const trace: string[] = [];

    const environment = await startWebQaEnvironment({
      delay: async () => undefined,
      fetchUrl: async (url) => {
        trace.push(`fetch:${url}`);
        return true;
      },
      spawnProcess: (name) => {
        trace.push(`spawn:${name}`);
        return fakeChild();
      },
    });

    expect(trace).toEqual([
      "spawn:fixture",
      "fetch:http://127.0.0.1:14100/health",
      "spawn:web",
      "fetch:http://localhost:13000/",
      "fetch:http://localhost:13000/agent",
    ]);

    environment.stop("SIGTERM");
  });

  it("stops started children when readiness fails", async () => {
    const fixture = fakeChild();

    await expect(
      startWebQaEnvironment({
        delay: async () => undefined,
        fetchUrl: async () => false,
        maxAttempts: 1,
        spawnProcess: () => fixture,
      }),
    ).rejects.toThrow("fixture");

    expect(fixture.killedWith).toBe("SIGTERM");
  });
});

function fakeChild(): WebQaChildProcess & { killedWith?: NodeJS.Signals } {
  return {
    exitCode: null,
    kill(signal) {
      this.killedWith = signal;
      return true;
    },
    once() {
      return this;
    },
  };
}
