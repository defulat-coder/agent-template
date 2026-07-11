import { describe, expect, it } from "vitest";
import { createHealthStatus } from "./health.js";

describe("createHealthStatus", () => {
  it("parses a valid health payload", () => {
    const status = createHealthStatus({
      service: "api",
      status: "ok",
      timestamp: new Date("2026-06-26T00:00:00.000Z").toISOString(),
      database: {
        status: "skipped",
        message: "not checked in test",
      },
      redis: {
        status: "skipped",
        message: "not checked in test",
      },
      queue: {
        name: "agent-jobs",
        status: "ready",
      },
      agent: {
        runtime: "claude",
        configured: false,
        model: "kimi-for-coding",
      },
      toolbox: {
        configured: true,
        url: "http://localhost:15000",
        capabilityProfile: "development-all",
      },
    });

    expect(status.service).toBe("api");
    expect(status.agent.configured).toBe(false);
    expect(status.toolbox.capabilityProfile).toBe("development-all");
  });
});
