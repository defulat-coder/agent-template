import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn, vercelOidc } from "eve/channels/auth";

function apiServiceAuth(): AuthFn<Request> {
  return (request) => {
    const expected = process.env.EVE_AGENT_SERVICE_TOKEN;

    if (expected) {
      return request.headers.get("x-agent-template-eve-token") === expected ? servicePrincipal() : null;
    }

    return isLocalServiceHost(new URL(request.url).hostname) ? servicePrincipal() : null;
  };
}

function servicePrincipal() {
  return {
    attributes: {},
    authenticator: "agent-template-api",
    principalId: "agent-template-api",
    principalType: "service" as const
  };
}

function isLocalServiceHost(hostname: string) {
  return hostname === "eve-agent" || hostname === "localhost" || hostname === "127.0.0.1";
}

export default eveChannel({
  auth: [apiServiceAuth(), vercelOidc(), localDev()]
});
