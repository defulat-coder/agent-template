import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));

export const webQaTopology = {
  fixture: {
    host: "127.0.0.1",
    port: 14_100,
    url: "http://127.0.0.1:14100",
  },
  web: {
    agentUrl: "http://localhost:13000/agent",
    url: "http://localhost:13000/",
  },
} as const;

type ProcessName = "fixture" | "web";

export type WebQaSpawnCommand = {
  command: "pnpm";
  args: string[];
};

export type WebQaChildProcess = {
  exitCode: number | null;
  kill(signal: NodeJS.Signals): boolean;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
};

type StartWebQaEnvironmentOptions = {
  delay?: (milliseconds: number) => Promise<void>;
  fetchUrl?: (url: string) => Promise<boolean>;
  maxAttempts?: number;
  onUnexpectedExit?: (
    name: ProcessName,
    code: number | null,
    signal: NodeJS.Signals | null,
  ) => void;
  signal?: AbortSignal;
  spawnProcess?: (
    name: ProcessName,
    extraEnv: NodeJS.ProcessEnv,
  ) => WebQaChildProcess;
};

export async function startWebQaEnvironment(
  options: StartWebQaEnvironmentOptions = {},
) {
  const delay = options.delay ?? defaultDelay;
  const fetchUrl = options.fetchUrl ?? defaultFetchUrl;
  const maxAttempts = options.maxAttempts ?? 150;
  const spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
  const children: WebQaChildProcess[] = [];
  let stopping = false;

  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.exitCode === null) child.kill(signal);
    }
  };

  options.signal?.addEventListener(
    "abort",
    () => stop(readSignal(options.signal?.reason)),
    { once: true },
  );

  try {
    const fixture = spawnProcess("fixture", {});
    children.push(fixture);
    watchChild(
      fixture,
      "fixture",
      () => stopping,
      stop,
      options.onUnexpectedExit,
    );
    await waitForUrl(
      "fixture",
      `${webQaTopology.fixture.url}/health`,
      fixture,
      fetchUrl,
      delay,
      maxAttempts,
    );

    const web = spawnProcess("web", {
      AGENT_API_URL: webQaTopology.fixture.url,
    });
    children.push(web);
    watchChild(web, "web", () => stopping, stop, options.onUnexpectedExit);
    await waitForUrl(
      "web home",
      webQaTopology.web.url,
      web,
      fetchUrl,
      delay,
      maxAttempts,
    );
    await waitForUrl(
      "web agent",
      webQaTopology.web.agentUrl,
      web,
      fetchUrl,
      delay,
      maxAttempts,
    );

    return { stop, topology: webQaTopology };
  } catch (error) {
    stop("SIGTERM");
    throw error;
  }
}

function defaultSpawnProcess(
  name: ProcessName,
  extraEnv: NodeJS.ProcessEnv,
): WebQaChildProcess {
  const { command, args } = getWebQaSpawnCommand(name);
  const detached = process.platform !== "win32";
  const child = spawn(command, args, {
    cwd: root,
    detached,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (!detached) return child;

  return {
    get exitCode() {
      return child.exitCode;
    },
    kill(signal) {
      if (!child.pid) return child.kill(signal);
      try {
        process.kill(-child.pid, signal);
        return true;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ESRCH"
        ) {
          return false;
        }
        throw error;
      }
    },
    once(event, listener) {
      child.once(event, listener);
      return this;
    },
  };
}

export function getWebQaSpawnCommand(name: ProcessName): WebQaSpawnCommand {
  return {
    command: "pnpm",
    args:
      name === "fixture"
        ? ["--filter", "@agent-template/web-qa", "fixture"]
        : [
            "--filter",
            "@agent-template/web",
            "exec",
            "next",
            "dev",
            "--webpack",
            "--port",
            "13000",
          ],
  };
}

async function defaultFetchUrl(url: string) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

function defaultDelay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForUrl(
  name: string,
  url: string,
  child: WebQaChildProcess,
  fetchUrl: (url: string) => Promise<boolean>,
  delay: (milliseconds: number) => Promise<void>,
  maxAttempts: number,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`${name} exited before becoming ready`);
    }
    if (await fetchUrl(url)) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${name}`);
}

function watchChild(
  child: WebQaChildProcess,
  name: ProcessName,
  isStopping: () => boolean,
  stop: (signal: NodeJS.Signals) => void,
  onUnexpectedExit: StartWebQaEnvironmentOptions["onUnexpectedExit"],
) {
  child.once("exit", (code, signal) => {
    if (isStopping()) return;
    onUnexpectedExit?.(name, code, signal);
    stop("SIGTERM");
  });
}

function readSignal(reason: unknown): NodeJS.Signals {
  return reason === "SIGINT" || reason === "SIGTERM" ? reason : "SIGTERM";
}
