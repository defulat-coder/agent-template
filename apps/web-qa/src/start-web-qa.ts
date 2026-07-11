import { startWebQaEnvironment } from "./environment.js";

const shutdown = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => shutdown.abort(signal));
}

const environment = await startWebQaEnvironment({
  onUnexpectedExit(name, code, signal) {
    console.error(`${name} exited unexpectedly (${signal ?? code ?? "unknown"})`);
    process.exitCode = code ?? 1;
  },
  signal: shutdown.signal,
});

console.info("Web QA environment ready:");
console.info(`  Web: ${environment.topology.web.url}`);
console.info(`  Fixture: ${environment.topology.fixture.url}`);
console.info("Use @Browser in Codex Desktop and follow apps/web-qa/flows/*.md.");
