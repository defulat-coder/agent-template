import { describe, expect, it } from "vitest";
import { routeAuth } from "eve/channels/auth";
import { matchesEveServiceToken } from "../agent/lib/service-auth.js";
import { createEveAuthPolicy } from "../agent/channels/eve.js";

describe("Eve service route auth", () => {
  it("accepts only the configured service token", () => {
    expect(matchesEveServiceToken("service-token", "service-token")).toBe(true);
    expect(matchesEveServiceToken("service-tokee", "service-token")).toBe(
      false,
    );
    expect(matchesEveServiceToken(null, "service-token")).toBe(false);
  });

  it("accepts a matching service token and rejects missing or wrong tokens", async () => {
    const auth = createEveAuthPolicy({
      EVE_AGENT_SERVICE_TOKEN: "service-token",
      NODE_ENV: "production",
    });

    await expect(
      routeAuth(
        request("http://eve-agent/eve/v1/sessions", "service-token"),
        auth,
      ),
    ).resolves.toMatchObject({ principalId: "agent-template-api" });

    for (const token of [undefined, "wrong-token"]) {
      const result = await routeAuth(
        request("http://eve-agent/eve/v1/sessions", token),
        auth,
      );
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
    }
  });

  it("keeps loopback open only for uncredentialed local development", async () => {
    const localResult = await routeAuth(
      request("http://127.0.0.1/eve/v1/sessions"),
      createEveAuthPolicy({ NODE_ENV: "development" }),
    );
    expect(localResult).toMatchObject({ principalType: "local-dev" });

    const productionResult = await routeAuth(
      request("http://127.0.0.1/eve/v1/sessions"),
      createEveAuthPolicy({ NODE_ENV: "production" }),
    );
    expect(productionResult).toBeInstanceOf(Response);
    expect((productionResult as Response).status).toBe(401);
  });
});

function request(url: string, token?: string) {
  return new Request(url, {
    ...(token ? { headers: { "x-agent-template-eve-token": token } } : {}),
  });
}
