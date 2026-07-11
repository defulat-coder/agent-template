import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const fixtureUrl = "http://127.0.0.1:14100";
const children: ChildProcess[] = [];
let shuttingDown = false;

const fixture = start(["--filter", "@agent-template/web-qa", "fixture"]);
await waitForFixture();
const web = start(["--filter", "@agent-template/web", "dev"], {
  NEXT_PUBLIC_API_BASE_URL: fixtureUrl,
});

watchChild(fixture, "fixture");
watchChild(web, "web");

console.info("Web QA environment ready:");
console.info("  Web: http://localhost:13000");
console.info(`  Fixture: ${fixtureUrl}`);
console.info("Use @Browser in Codex Desktop and follow apps/web-qa/flows/*.md.");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => shutdown(signal));
}

function start(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const child = spawn("pnpm", args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  children.push(child);
  return child;
}

function watchChild(child: ChildProcess, name: string) {
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${name} exited unexpectedly (${signal ?? code ?? "unknown"})`);
    process.exitCode = code ?? 1;
    shutdown("SIGTERM");
  });
}

async function waitForFixture() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (fixture.exitCode !== null) {
      throw new Error("Web QA fixture exited before becoming ready");
    }
    try {
      const response = await fetch(`${fixtureUrl}/health`);
      if (response.ok) return;
    } catch {
      // The fixture process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for Web QA fixture");
}

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal);
  }
}
