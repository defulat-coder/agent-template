import { describe, expect, it } from "vitest";
import {
  createChatScenario,
  supportsScenarioRoute,
} from "./scenarios.js";

describe("Web QA scenario catalog", () => {
  it("declares the routes each scenario supports", () => {
    expect(supportsScenarioRoute("health-ok", "/")).toBe(true);
    expect(supportsScenarioRoute("health-ok", "/agent")).toBe(true);
    expect(supportsScenarioRoute("health-degraded", "/agent")).toBe(false);
    expect(supportsScenarioRoute("chat-failed", "/agent")).toBe(true);
    expect(supportsScenarioRoute("chat-failed", "/")).toBe(false);
  });

  it("rejects chat behavior for a health-only scenario", () => {
    expect(() => createChatScenario("health-degraded", 3)).toThrow(
      "does not support Agent Chat",
    );
  });
});
