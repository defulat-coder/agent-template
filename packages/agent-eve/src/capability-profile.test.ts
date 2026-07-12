import { describe, expect, it } from "vitest";
import {
  hasToolboxCapabilities,
  hasToolboxSkill,
} from "../agent/lib/capability-profile.js";

describe("Eve dynamic Skill capability profile", () => {
  it("exposes a Skill only when every required Toolbox Tool is visible", () => {
    const requiredTools = [
      "summarize-ecommerce-sales-by-day",
      "summarize-ecommerce-sales-by-channel",
    ] as const;

    expect(
      hasToolboxCapabilities(requiredTools, {
        AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toBe(true);
    expect(
      hasToolboxCapabilities(requiredTools, {
        AGENT_CAPABILITY_PROFILE: "ecommerce-product",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toBe(false);
  });

  it("activates generated Skills by the compiled capability slug", () => {
    expect(
      hasToolboxSkill("finance-analysis", {
        AGENT_CAPABILITY_PROFILE: "finance-controller",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toBe(true);
    expect(
      hasToolboxSkill("finance-analysis", {
        AGENT_CAPABILITY_PROFILE: "logistics-operator",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toBe(false);
  });

  it("does not expose generated Skills without a Toolbox connection", () => {
    expect(
      hasToolboxCapabilities(["summarize-ecommerce-sales-by-day"], {
        NODE_ENV: "production",
      }),
    ).toBe(false);
    expect(
      hasToolboxSkill("ecommerce-sales-analysis", { NODE_ENV: "production" }),
    ).toBe(false);
  });
});
