import { strict as assert } from "node:assert";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  toolboxCapabilityProfiles,
  toolboxToolNames,
  toolboxToolScopes,
  type ToolboxToolScope,
} from "@agent-template/toolbox-config";
import { startLocalToolbox } from "./local-toolbox-server.js";

const productionConfig = fileURLToPath(
  new URL("../../generated/toolbox-production/tools.yaml", import.meta.url),
);
const database = {
  database: process.env.TOOLBOX_POSTGRES_DATABASE ?? "project_template",
  host: process.env.TOOLBOX_POSTGRES_HOST ?? "127.0.0.1",
  password: process.env.TOOLBOX_POSTGRES_PASSWORD ?? "project_template",
  port: process.env.TOOLBOX_POSTGRES_PORT ?? "15432",
  user: process.env.TOOLBOX_POSTGRES_USER ?? "project_template",
};
const audience = process.env.TOOLBOX_OIDC_AUDIENCE ?? "agent-template-toolbox";
const businessWindow = {
  from: "2026-06-01T00:00:00Z",
  to: "2026-07-01T00:00:00Z",
};
const minimumScopeCases = {
  "agent-template:observe": {
    arguments: { limit: 1 },
    tool: "list-template-events",
  },
  "ecommerce:read": {
    arguments: businessWindow,
    tool: "summarize_sales_by_region",
  },
  "finance:read": {
    arguments: businessWindow,
    tool: "summarize_finance_overview",
  },
  "logistics:read": {
    arguments: businessWindow,
    tool: "summarize_carrier_performance",
  },
  "marketing:read": {
    arguments: businessWindow,
    tool: "summarize_marketing_by_channel",
  },
  "supply-chain:read": {
    arguments: businessWindow,
    tool: "summarize_inventory_health",
  },
} as const satisfies Record<
  ToolboxToolScope,
  { arguments: Record<string, unknown>; tool: string }
>;

async function main() {
  const oidc = await startLocalOidcIssuer(audience);
  let toolbox: Awaited<ReturnType<typeof startLocalToolbox>> | undefined;
  let client: Client | undefined;
  const scopedClients: Client[] = [];

  try {
    toolbox = await startLocalToolbox({
      configPath: productionConfig,
      env: {
        TOOLBOX_OIDC_AUDIENCE: audience,
        TOOLBOX_OIDC_ISSUER: oidc.issuer,
        TOOLBOX_POSTGRES_DATABASE: database.database,
        TOOLBOX_POSTGRES_HOST: database.host,
        TOOLBOX_POSTGRES_PASSWORD: database.password,
        TOOLBOX_POSTGRES_PORT: database.port,
        TOOLBOX_POSTGRES_USER: database.user,
      },
    });
    client = await waitForAuthorizedToolbox(toolbox.url, oidc.tokens.all);
    await assertUnauthenticatedRequestIsRejected(toolbox.url);

    const tools = await client.listTools();
    assert.equal(tools.tools.length, toolboxToolNames.length);
    const liveToolNames = new Set(tools.tools.map((tool) => tool.name));
    for (const [profileName, profileTools] of Object.entries(
      toolboxCapabilityProfiles,
    )) {
      assert.ok(profileTools.length > 0, `${profileName} must not be empty`);
      for (const toolName of profileTools) {
        assert.ok(
          liveToolNames.has(toolName),
          `${profileName} references missing live tool ${toolName}`,
        );
      }
    }

    const result = await client.callTool({
      name: "summarize_sales_by_region",
      arguments: {
        from: "2026-06-01T00:00:00Z",
        to: "2026-07-01T00:00:00Z",
      },
    });
    assert.equal(result.isError, undefined);
    assert.ok(Array.isArray(result.content) && result.content.length > 0);

    const denialCount = await verifyMinimumScopeMatrix(
      toolbox.url,
      oidc.scopes,
      oidc.tokens.byScope,
      scopedClients,
    );

    console.log(
      `Local Toolbox OIDC verification passed: unauthenticated MCP rejected, ${toolboxToolNames.length} scoped tools listed, ${Object.keys(toolboxCapabilityProfiles).length} Agent capability profiles matched live tools, ${oidc.scopes.length} minimum-scope clients passed their positive calls, and all ${denialCount} directed cross-scope calls were denied.`,
    );
  } finally {
    await Promise.allSettled(
      [...scopedClients, client]
        .filter((item): item is Client => Boolean(item))
        .map((item) => withTimeout(item.close(), 2_000)),
    );
    try {
      await toolbox?.stop();
    } finally {
      oidc.server.closeAllConnections();
      await withTimeout(closeServer(oidc.server), 2_000).catch(() => undefined);
    }
  }
}

async function verifyMinimumScopeMatrix(
  toolboxUrl: string,
  scopes: readonly ToolboxToolScope[],
  tokens: Readonly<Record<ToolboxToolScope, string>>,
  clients: Client[],
) {
  const clientsByScope = new Map<ToolboxToolScope, Client>();

  for (const scope of scopes) {
    const scopedClient = await connectClient(toolboxUrl, tokens[scope]);
    clients.push(scopedClient);
    clientsByScope.set(scope, scopedClient);
    const testCase = minimumScopeCases[scope];
    const result = await scopedClient.callTool({
      name: testCase.tool,
      arguments: testCase.arguments,
    });
    assert.equal(
      result.isError,
      undefined,
      `${scope} must authorize its representative tool ${testCase.tool}`,
    );
  }

  let denialCount = 0;
  for (const callerScope of scopes) {
    const scopedClient = clientsByScope.get(callerScope);
    assert.ok(scopedClient, `Missing minimum-scope client for ${callerScope}`);
    for (const requiredScope of scopes) {
      if (requiredScope === callerScope) continue;
      const testCase = minimumScopeCases[requiredScope];
      await assertToolCallIsForbidden(
        scopedClient,
        testCase.tool,
        testCase.arguments,
        requiredScope,
      );
      denialCount += 1;
    }
  }

  assert.equal(denialCount, scopes.length * (scopes.length - 1));
  return denialCount;
}

async function assertToolCallIsForbidden(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  requiredScope: string,
) {
  const forbiddenPattern = new RegExp(
    `403|forbidden|insufficient scopes|${requiredScope}`,
    "i",
  );

  try {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, `${name} unexpectedly succeeded`);
    assert.match(JSON.stringify(result.content), forbiddenPattern);
  } catch (error) {
    assert.match(String(error), forbiddenPattern);
  }
}

async function waitForAuthorizedToolbox(url: string, token: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const client = await connectClient(url, token);
      const tools = await client.listTools();
      if (tools.tools.length === toolboxToolNames.length) return client;
      await client.close();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("Authenticated Toolbox did not become ready");
}

async function assertUnauthenticatedRequestIsRejected(url: string) {
  await assert.rejects(async () => {
    const client = await connectClient(url);
    await client.close();
  });
}

async function connectClient(url: string, token?: string) {
  const client = new Client(
    { name: "agent-template-local-auth-verifier", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL(`${url.replace(/\/$/, "")}/mcp`),
    token
      ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
      : undefined,
  );
  try {
    await client.connect(transport as Parameters<Client["connect"]>[0]);
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

async function startLocalOidcIssuer(aud: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const keyId = "agent-template-local-oidc";
  const publicJwk = publicKey.export({ format: "jwk" }) as Record<
    string,
    unknown
  >;
  const server = createServer();
  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const issuer = `http://127.0.0.1:${address.port}`;

  server.on("request", (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/.well-known/openid-configuration") {
      response.end(
        JSON.stringify({
          authorization_endpoint: `${issuer}/authorize`,
          id_token_signing_alg_values_supported: ["RS256"],
          issuer,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          token_endpoint: `${issuer}/token`,
        }),
      );
      return;
    }
    if (request.url === "/jwks") {
      response.end(
        JSON.stringify({
          keys: [{ ...publicJwk, alg: "RS256", kid: keyId, use: "sig" }],
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const createToken = (scope: string) =>
    signJwt(
      {
        aud,
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        iss: issuer,
        scope,
        sub: "local-verifier",
      },
      privateKey,
      keyId,
    );

  const scopes = Array.from(
    new Set(Object.values(toolboxToolScopes)),
  ) as ToolboxToolScope[];
  const byScope = Object.fromEntries(
    scopes.map((scope) => [scope, createToken(`mcp:tools ${scope}`)]),
  ) as Record<ToolboxToolScope, string>;

  return {
    issuer,
    scopes,
    server,
    tokens: {
      all: createToken(`mcp:tools ${scopes.join(" ")}`),
      byScope,
    },
  };
}

function signJwt(
  payload: Record<string, unknown>,
  privateKey: KeyObject,
  keyId: string,
) {
  const header = encodeJson({ alg: "RS256", kid: keyId, typ: "JWT" });
  const body = encodeJson(payload);
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  signer.end();
  return `${header}.${body}.${signer.sign(privateKey).toString("base64url")}`;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`Cleanup timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      timeout.unref?.();
    }),
  ]).finally(() => clearTimeout(timeout));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
