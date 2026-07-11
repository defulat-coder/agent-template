import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const generateArguments = [
  "generate",
  "--draft",
  "clear",
  "--yes",
  "--stdio",
] as const;

type ZReadCliOptions = {
  assertSafeText: (content: string, label: string) => void;
  binary: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  expectedVersion: string;
};

type ZReadEvent = {
  done?: unknown;
  error?: unknown;
  vm?: {
    pages?: {
      tasks?: Array<{
        error?: unknown;
        slug?: unknown;
        state?: unknown;
      }>;
      waiting_retry?: unknown;
    };
    state?: unknown;
    version?: unknown;
  };
  waiting_for?: unknown;
};

export async function runZReadCliGeneration(
  options: ZReadCliOptions,
): Promise<void> {
  const { stdout } = await execFile(options.binary, ["version", "--stdio"], {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.environment,
  });
  options.assertSafeText(stdout, "ZRead version stdout");
  const version = readTerminalVersion(stdout);
  if (version !== options.expectedVersion) {
    throw new Error(
      `Expected ZRead CLI ${options.expectedVersion}, received ${version}`,
    );
  }

  await runGenerationProcess(options);
}

function readTerminalVersion(output: string): string {
  const events = output
    .split("\n")
    .filter((line) => line.trim())
    .map(parseEvent);
  const version = events.find((event) => event.done === true)?.vm?.version;
  if (typeof version !== "string") {
    throw new Error(
      "ZRead version command did not emit a terminal version event",
    );
  }
  return version;
}

function runGenerationProcess(options: ZReadCliOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.binary, generateArguments, {
      cwd: options.cwd,
      env: options.environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    let stderr = "";
    let stdoutTranscript = "";
    let exited = false;
    let failure: Error | undefined;
    let quitSent = false;
    let terminalSuccess = false;
    let terminationTimer: NodeJS.Timeout | undefined;

    const requestQuit = (error: Error): void => {
      failure ??= error;
      if (quitSent || exited) {
        return;
      }
      quitSent = true;
      child.stdin.write('{"type":"quit","params":{}}\n', (writeError) => {
        if (writeError) {
          failure = new AggregateError(
            [failure, writeError],
            "ZRead failed and the quit command could not be delivered",
          );
        }
      });
      terminationTimer = setTimeout(() => child.kill("SIGTERM"), 5_000);
      terminationTimer.unref();
    };

    const acceptLine = (line: string): void => {
      if (!line.trim()) {
        return;
      }
      let event: ZReadEvent;
      try {
        event = parseEvent(line);
      } catch (error) {
        requestQuit(asError(error));
        return;
      }

      if (typeof event.error === "string" && event.error.trim()) {
        requestQuit(
          new Error(`ZRead generation failed: ${event.error.trim()}`),
        );
      }
      if (event.vm?.state === "error") {
        requestQuit(new Error("ZRead generation entered an error state"));
      }

      const waitingFor = Array.isArray(event.waiting_for)
        ? event.waiting_for.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      if (waitingFor.includes("retry") || waitingFor.includes("skip_all")) {
        requestQuit(new Error(describeFailedPages(event)));
      }

      if (event.done === true && !failure) {
        terminalSuccess = true;
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutTranscript += chunk;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        acceptLine(line);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      exited = true;
      if (terminationTimer) {
        clearTimeout(terminationTimer);
      }
      if (buffer.trim()) {
        acceptLine(buffer);
      }
      try {
        options.assertSafeText(stdoutTranscript, "ZRead generation stdout");
        options.assertSafeText(stderr, "ZRead generation stderr");
      } catch (error) {
        failure ??= asError(error);
      }
      if (stderr && !failure) {
        process.stderr.write(stderr);
      }
      if (failure) {
        reject(failure);
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `ZRead generation failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
          ),
        );
        return;
      }
      if (!terminalSuccess) {
        reject(
          new Error("ZRead generation exited without a terminal done event"),
        );
        return;
      }
      resolve();
    });
  });
}

function parseEvent(line: string): ZReadEvent {
  try {
    const event = JSON.parse(line) as unknown;
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("event must be an object");
    }
    return event as ZReadEvent;
  } catch (error) {
    throw new Error(`ZRead emitted invalid JSONL: ${line}`, { cause: error });
  }
}

function describeFailedPages(event: ZReadEvent): string {
  const failed = event.vm?.pages?.tasks
    ?.filter((task) => task.state === "failed")
    .map((task) => {
      const slug = typeof task.slug === "string" ? task.slug : "unknown-page";
      const error =
        typeof task.error === "string" ? task.error : "unknown error";
      return `${slug}: ${error}`;
    });
  return failed?.length
    ? `ZRead page generation failed: ${failed.join("; ")}`
    : "ZRead page generation failed and is waiting for retry or skip";
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
