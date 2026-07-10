import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createMcpHost,
  loadMcpHostConfig,
  readAgentCapabilityTools,
} from "./index.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const toolboxExecutable = fileURLToPath(
  new URL("../../../node_modules/.bin/toolbox", import.meta.url),
);
const productionConfig = fileURLToPath(
  new URL("../../../generated/toolbox-production/tools.yaml", import.meta.url),
);
const database = {
  database: process.env.TOOLBOX_POSTGRES_DATABASE ?? "project_template",
  host: process.env.TOOLBOX_POSTGRES_HOST ?? "127.0.0.1",
  password: process.env.TOOLBOX_POSTGRES_PASSWORD ?? "project_template",
  port: process.env.TOOLBOX_POSTGRES_PORT ?? "15432",
  user: process.env.TOOLBOX_POSTGRES_USER ?? "project_template",
};
const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${database.user}:${database.password}@${database.host}:${database.port}/${database.database}?schema=public`;
const audience = process.env.TOOLBOX_OIDC_AUDIENCE ?? "agent-template-toolbox";
const expectedToolCount = 18;

async function main() {
  const oidc = await startLocalOidcIssuer(audience);
  const toolboxPort = await reservePort();
  const toolboxUrl = `http://127.0.0.1:${toolboxPort}`;
  const toolbox = startToolbox({
    audience,
    issuer: oidc.issuer,
    toolboxPort,
    toolboxUrl,
  });

  try {
    await waitForAuthorizedToolbox(toolboxUrl, oidc.token);
    await assertUnauthenticatedRequestIsRejected(toolboxUrl);

    const hostConfig = loadMcpHostConfig({
      DATABASE_URL: databaseUrl,
      TOOLBOX_AUTH_TOKEN: oidc.token,
      TOOLBOX_URL: toolboxUrl,
    });
    const host = createMcpHost(hostConfig);
    const tools = await host.listTools("toolbox");
    assert.equal(tools.length, expectedToolCount);
    const liveToolNames = new Set(tools.map((tool) => tool.name));
    for (const profileName of Object.keys(hostConfig.capabilityProfiles)) {
      const profileTools = readAgentCapabilityTools({
        ...hostConfig,
        agentCapabilityProfile: profileName,
      });
      assert.ok(profileTools.length > 0, `${profileName} must not be empty`);
      for (const toolName of profileTools) {
        assert.ok(
          liveToolNames.has(toolName),
          `${profileName} references missing live tool ${toolName}`,
        );
      }
    }

    const result = await host.callTool("toolbox", "summarize_sales_by_region", {
      from: "2026-06-01T00:00:00Z",
      to: "2026-07-01T00:00:00Z",
    });
    assert.equal(result.isError, undefined);
    assert.ok(result.content.length > 0);
    const certifiedQuery = result.structuredContent?.certifiedQuery as
      | Record<string, unknown>
      | undefined;
    assert.equal(certifiedQuery?.kind, "certified-query-result");
    assert.deepEqual(certifiedQuery?.catalog, {
      name: "ecommerce-retail-example",
      version: 1,
    });

    console.log(
      `Local Toolbox OIDC verification passed: unauthenticated MCP rejected, 18 scoped tools listed, ${Object.keys(hostConfig.capabilityProfiles).length} Agent capability profiles matched live tools, and an authenticated business query returned certified semantic provenance through MCP Host.`,
    );
  } finally {
    await stopProcess(toolbox);
    await closeServer(oidc.server);
  }
}

function startToolbox(input: {
  audience: string;
  issuer: string;
  toolboxPort: number;
  toolboxUrl: string;
}) {
  const child = spawn(
    toolboxExecutable,
    [
      "--config",
      productionConfig,
      "--toolbox-url",
      input.toolboxUrl,
      "--address",
      "127.0.0.1",
      "--port",
      String(input.toolboxPort),
      "--logging-format",
      "JSON",
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        TOOLBOX_OIDC_AUDIENCE: input.audience,
        TOOLBOX_OIDC_ISSUER: input.issuer,
        TOOLBOX_POSTGRES_DATABASE: database.database,
        TOOLBOX_POSTGRES_HOST: database.host,
        TOOLBOX_POSTGRES_PASSWORD: database.password,
        TOOLBOX_POSTGRES_PORT: database.port,
        TOOLBOX_POSTGRES_USER: database.user,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let logs = "";
  child.stdout?.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.once("exit", (code) => {
    if (code && code !== 0) {
      process.stderr.write(logs);
    }
  });
  return child;
}

async function waitForAuthorizedToolbox(url: string, token: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const client = await connectClient(url, token);
      try {
        const tools = await client.listTools();
        if (tools.tools.length === expectedToolCount) return;
      } finally {
        await client.close();
      }
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
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    ...(token
      ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
      : {}),
  });
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

  return {
    issuer,
    server,
    token: signJwt(
      {
        aud,
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        iss: issuer,
        scope: "mcp:tools ecommerce:read agent-template:observe",
        sub: "local-verifier",
      },
      privateKey,
      keyId,
    ),
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

async function reservePort() {
  const server = createServer();
  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const { port } = address;
  await closeServer(server);
  return port;
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

async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

await main();
