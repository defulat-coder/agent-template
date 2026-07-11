import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn, vercelOidc } from "eve/channels/auth";
import { matchesEveServiceToken } from "../lib/service-auth";

type EveAuthEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "EVE_AGENT_SERVICE_TOKEN" | "NODE_ENV">
>;

function apiServiceAuth(expected: string | undefined): AuthFn<Request> {
  return (request) => {
    if (expected) {
      return matchesEveServiceToken(
        request.headers.get("x-agent-template-eve-token"),
        expected,
      )
        ? servicePrincipal()
        : null;
    }

    return null;
  };
}

export function createEveAuthPolicy(
  environment: EveAuthEnvironment = process.env,
): readonly AuthFn<Request>[] {
  const serviceToken = environment.EVE_AGENT_SERVICE_TOKEN;
  const deploymentAuth = [apiServiceAuth(serviceToken), vercelOidc()];

  return environment.NODE_ENV === "production" || serviceToken
    ? deploymentAuth
    : [...deploymentAuth, localDev()];
}

function servicePrincipal() {
  return {
    attributes: {},
    authenticator: "agent-template-api",
    principalId: "agent-template-api",
    principalType: "service" as const,
  };
}

export default eveChannel({
  auth: createEveAuthPolicy(),
});
