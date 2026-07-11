import { describe, expect, it } from "vitest";
import {
  getWebQaSpawnCommand,
  startWebQaEnvironment,
  type WebQaChildProcess,
} from "./environment.js";

describe("Web QA environment lifecycle interface", () => {
  it("uses webpack for the QA Web server to avoid Turbopack load spikes", () => {
    expect(getWebQaSpawnCommand("web")).toEqual({
      command: "pnpm",
      args: [
        "--filter",
        "@agent-template/web",
        "exec",
        "next",
        "dev",
        "--webpack",
        "--port",
        "13000",
      ],
    });
  });

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

  it("stops sibling processes when one child exits unexpectedly", async () => {
    const fixture = fakeChild();
    const web = fakeChild();

    await startWebQaEnvironment({
      delay: async () => undefined,
      fetchUrl: async () => true,
      spawnProcess: (name) => (name === "fixture" ? fixture : web),
    });

    fixture.emitExit(1, null);

    expect(web.killedWith).toBe("SIGTERM");
  });
});

function fakeChild(): WebQaChildProcess & {
  emitExit(code: number | null, signal: NodeJS.Signals | null): void;
  killedWith?: NodeJS.Signals;
} {
  let exitListener:
    | ((code: number | null, signal: NodeJS.Signals | null) => void)
    | undefined;
  return {
    exitCode: null,
    emitExit(code, signal) {
      exitListener?.(code, signal);
    },
    kill(signal) {
      this.killedWith = signal;
      return true;
    },
    once(_event, listener) {
      exitListener = listener;
      return this;
    },
  };
}
