import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runZReadCliGeneration } from "./zread-cli.js";

test("runs a project-local ZRead CLI through a successful terminal event", async () => {
  const fixture = await createFakeZRead();

  try {
    await runZReadCliGeneration({
      assertSafeText: () => undefined,
      binary: fixture.binary,
      cwd: fixture.root,
      environment: { ...process.env, FAKE_ZREAD_MODE: "success" },
      expectedVersion: "0.2.13",
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("quits and fails instead of hanging when ZRead waits for a page retry", async () => {
  const fixture = await createFakeZRead();

  try {
    await assert.rejects(
      runZReadCliGeneration({
        assertSafeText: () => undefined,
        binary: fixture.binary,
        cwd: fixture.root,
        environment: {
          ...process.env,
          FAKE_ZREAD_MODE: "waiting-retry",
          FAKE_ZREAD_QUIT_MARKER: fixture.quitMarker,
        },
        expectedVersion: "0.2.13",
      }),
      /broken-page: model output was invalid/,
    );
    await access(fixture.quitMarker);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects a project-local CLI version that differs from the lockfile", async () => {
  const fixture = await createFakeZRead();

  try {
    await assert.rejects(
      runZReadCliGeneration({
        assertSafeText: () => undefined,
        binary: fixture.binary,
        cwd: fixture.root,
        environment: { ...process.env, FAKE_ZREAD_VERSION: "0.2.12" },
        expectedVersion: "0.2.13",
      }),
      /Expected ZRead CLI 0\.2\.13, received 0\.2\.12/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("drains the complete stdout stream before accepting terminal success", async () => {
  const fixture = await createFakeZRead();

  try {
    await assert.rejects(
      runZReadCliGeneration({
        assertSafeText: () => undefined,
        binary: fixture.binary,
        cwd: fixture.root,
        environment: { ...process.env, FAKE_ZREAD_MODE: "failure-tail" },
        expectedVersion: "0.2.13",
      }),
      /failure arrived after terminal snapshot/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects credentials emitted by the CLI", async () => {
  const fixture = await createFakeZRead();

  try {
    await assert.rejects(
      runZReadCliGeneration({
        assertSafeText(content, label) {
          if (content.includes("provider-secret")) {
            throw new Error(
              `${label} contains the configured provider credential`,
            );
          }
        },
        binary: fixture.binary,
        cwd: fixture.root,
        environment: { ...process.env, FAKE_ZREAD_MODE: "secret-stderr" },
        expectedVersion: "0.2.13",
      }),
      /ZRead generation stderr contains the configured provider credential/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFakeZRead(): Promise<{
  binary: string;
  quitMarker: string;
  root: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "fake-zread-"));
  const binary = path.join(root, "zread");
  const quitMarker = path.join(root, "quit-received");
  await writeFile(
    binary,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
const command = process.argv[2];
if (command === "version") {
  console.log(JSON.stringify({ vm: { version: process.env.FAKE_ZREAD_VERSION || "0.2.13" }, done: true }));
  process.exit(0);
}
if (process.env.FAKE_ZREAD_MODE === "waiting-retry") {
  console.log(JSON.stringify({
    vm: { state: "running", pages: { waiting_retry: true, tasks: [{ state: "failed", slug: "broken-page", error: "model output was invalid" }] } },
    waiting_for: ["quit", "retry", "skip_all"],
    done: false,
    error: ""
  }));
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data) => {
    if (data.includes('"type":"quit"')) {
      writeFileSync(process.env.FAKE_ZREAD_QUIT_MARKER, "ok");
      console.log(JSON.stringify({ vm: { state: "done" }, waiting_for: [], done: true, error: "" }));
      process.exit(0);
    }
  });
} else if (process.env.FAKE_ZREAD_MODE === "failure-tail") {
  console.log(JSON.stringify({ vm: { state: "done" }, waiting_for: [], done: true, error: "" }));
  process.stdout.write(JSON.stringify({ vm: { state: "error" }, waiting_for: [], done: false, error: "failure arrived after terminal snapshot" }));
} else if (process.env.FAKE_ZREAD_MODE === "secret-stderr") {
  console.error("provider-secret");
  console.log(JSON.stringify({ vm: { state: "done" }, waiting_for: [], done: true, error: "" }));
} else {
  console.log(JSON.stringify({ vm: { state: "running" }, waiting_for: ["quit"], done: false, error: "" }));
  console.log(JSON.stringify({ vm: { state: "done" }, waiting_for: [], done: true, error: "" }));
}
`,
    { mode: 0o755 },
  );
  return { binary, quitMarker, root };
}
