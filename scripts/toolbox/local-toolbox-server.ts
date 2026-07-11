import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const toolboxExecutable = resolveToolboxExecutable();
const useProcessGroups = process.platform !== "win32";
const activeToolboxProcesses = new Map<number, ChildProcess>();
let cleanupHandlersInstalled = false;

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
      detached: useProcessGroups,
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
  const childPid = child.pid;
  if (!childPid) throw new Error("Toolbox process did not receive a pid");
  activeToolboxProcesses.set(childPid, child);
  installCleanupHandlers();
  let stopped = false;

  return {
    getLogs: () => logs,
    async stop() {
      if (stopped) return;
      stopped = true;
      signalToolboxProcess(childPid, child, "SIGTERM");
      if (!(await waitForProcessGroupExit(childPid, 2_000))) {
        signalToolboxProcess(childPid, child, "SIGKILL");
        await waitForProcessGroupExit(childPid, 1_000);
      }
      activeToolboxProcesses.delete(childPid);
    },
    url,
  };
}

function installCleanupHandlers() {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;
  const cleanup = () => signalAllToolboxProcesses("SIGTERM");
  process.once("exit", cleanup);
  process.once("uncaughtExceptionMonitor", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
}

function signalAllToolboxProcesses(signal: NodeJS.Signals) {
  for (const [pid, child] of activeToolboxProcesses) {
    signalToolboxProcess(pid, child, signal);
  }
}

function signalToolboxProcess(
  pid: number,
  child: ChildProcess,
  signal: NodeJS.Signals,
) {
  try {
    if (useProcessGroups) process.kill(-pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
  }
}

async function waitForProcessGroupExit(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessGroupAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !isProcessGroupAlive(pid);
}

function isProcessGroupAlive(pid: number) {
  try {
    process.kill(useProcessGroups ? -pid : pid, 0);
    return true;
  } catch (error) {
    if (isMissingProcess(error)) return false;
    throw error;
  }
}

function isMissingProcess(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
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
