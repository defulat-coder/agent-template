import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const toolboxExecutable = resolveToolboxExecutable();

export async function startLocalToolbox(input: {
  args?: string[];
  configPath: string;
  env?: Record<string, string | undefined>;
}) {
  const runtimeEnv = { ...process.env, ...input.env };
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    toolboxExecutable,
    [
      "--config",
      input.configPath,
      "--toolbox-url",
      url,
      "--address",
      "127.0.0.1",
      "--port",
      String(port),
      "--logging-format",
      "JSON",
      "--log-level",
      runtimeEnv.TOOLBOX_LOG_LEVEL ?? "INFO",
      "--telemetry-service-name",
      runtimeEnv.TOOLBOX_TELEMETRY_SERVICE_NAME ?? "agent-template-toolbox",
      ...(runtimeEnv.TOOLBOX_SQL_COMMENTER === "false"
        ? []
        : ["--sql-commenter"]),
      ...(runtimeEnv.TOOLBOX_OTLP_ENDPOINT
        ? ["--telemetry-otlp", runtimeEnv.TOOLBOX_OTLP_ENDPOINT]
        : []),
      ...(input.args ?? []),
    ],
    {
      cwd: repositoryRoot,
      env: runtimeEnv,
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

  return {
    getLogs: () => logs,
    async stop() {
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
    },
    url,
  };
}

async function reservePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to reserve a local Toolbox port");
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function resolveToolboxExecutable() {
  const platformPackages: Record<string, string> = {
    "darwin-arm64": "@toolbox-sdk/server-darwin-arm64",
    "darwin-x64": "@toolbox-sdk/server-darwin-x64",
    "linux-x64": "@toolbox-sdk/server-linux-x64",
    "win32-arm64": "@toolbox-sdk/server-win32-arm64",
    "win32-x64": "@toolbox-sdk/server-win32-x64",
  };
  const key = `${process.platform}-${process.arch}`;
  const packageName = platformPackages[key];
  if (!packageName) throw new Error(`Unsupported Toolbox platform: ${key}`);

  const require = createRequire(import.meta.url);
  const packageJson = require.resolve(`${packageName}/package.json`);
  return join(
    dirname(packageJson),
    "bin",
    process.platform === "win32" ? "toolbox.exe" : "toolbox",
  );
}
