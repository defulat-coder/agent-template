import { strict as assert } from "node:assert";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  toolboxCapabilityProfiles,
  toolboxToolNames,
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

async function main() {
  const oidc = await startLocalOidcIssuer(audience);
  const toolbox = await startLocalToolbox({
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
  let client: Client | undefined;
  let ecommerceClient: Client | undefined;
  let observeClient: Client | undefined;

  try {
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
    assert.ok(result.content.length > 0);

    ecommerceClient = await connectClient(
      toolbox.url,
      oidc.tokens.ecommerceRead,
    );
    const ecommerceResult = await ecommerceClient.callTool({
      name: "summarize_sales_by_region",
      arguments: {
        from: "2026-06-01T00:00:00Z",
        to: "2026-07-01T00:00:00Z",
      },
    });
    assert.equal(ecommerceResult.isError, undefined);
    await assertToolCallIsForbidden(
      ecommerceClient,
      "list-template-events",
      { limit: 1 },
      "agent-template:observe",
    );

    observeClient = await connectClient(toolbox.url, oidc.tokens.observe);
    const observeResult = await observeClient.callTool({
      name: "list-template-events",
      arguments: { limit: 1 },
    });
    assert.equal(observeResult.isError, undefined);
    await assertToolCallIsForbidden(
      observeClient,
      "summarize_sales_by_region",
      {
        from: "2026-06-01T00:00:00Z",
        to: "2026-07-01T00:00:00Z",
      },
      "ecommerce:read",
    );

    console.log(
      `Local Toolbox OIDC verification passed: unauthenticated MCP rejected, 18 scoped tools listed, ${Object.keys(toolboxCapabilityProfiles).length} Agent capability profiles matched live tools, and ecommerce/observe minimum-scope clients passed positive and negative Tool calls.`,
    );
  } finally {
    await observeClient?.close();
    await ecommerceClient?.close();
    await client?.close();
    await toolbox.stop();
    await closeServer(oidc.server);
  }
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
  await client.connect(transport as Parameters<Client["connect"]>[0]);
  return client;
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

  return {
    issuer,
    server,
    tokens: {
      all: createToken("mcp:tools ecommerce:read agent-template:observe"),
      ecommerceRead: createToken("mcp:tools ecommerce:read"),
      observe: createToken("mcp:tools agent-template:observe"),
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

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
