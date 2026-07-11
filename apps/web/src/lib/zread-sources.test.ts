import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { listZReadSourcePaths, readZReadSourceFile } from "./zread-sources";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("reads only sources listed by the active canonical index", async () => {
  const { repositoryRoot, wikiRoot } = await createFixture();
  await writeFile(path.join(repositoryRoot, "README.md"), "# Project\n");
  await writeFile(path.join(repositoryRoot, "secret.txt"), "not indexed\n");

  assert.deepEqual(await listZReadSourcePaths(wikiRoot), ["README.md"]);
  assert.deepEqual(await readZReadSourceFile(wikiRoot, ["README.md"]), {
    content: "# Project\n",
    sourcePath: "README.md",
  });
  assert.equal(
    await readZReadSourceFile(wikiRoot, ["secret.txt"]),
    null,
  );
});

test("rejects source indexes for a different active version", async () => {
  const { wikiRoot } = await createFixture();
  const indexPath = path.join(
    wikiRoot,
    "versions",
    "2026-07-11_2030_abc123",
    "sources.json",
  );
  await writeFile(
    indexPath,
    JSON.stringify({ id: "other-version", sources: [] }),
  );

  await assert.rejects(listZReadSourcePaths(wikiRoot), /sources\.json index id/);
});

async function createFixture() {
  const repositoryRoot = await mkdtemp(
    path.join(tmpdir(), "zread-sources-test-"),
  );
  temporaryRoots.push(repositoryRoot);
  const wikiRoot = path.join(repositoryRoot, ".zread", "wiki");
  const versionRoot = path.join(
    wikiRoot,
    "versions",
    "2026-07-11_2030_abc123",
  );
  await mkdir(versionRoot, { recursive: true });
  await writeFile(path.join(wikiRoot, "current"), "2026-07-11_2030_abc123\n");
  await writeFile(
    path.join(versionRoot, "sources.json"),
    JSON.stringify({
      id: "2026-07-11_2030_abc123",
      sources: [{ path: "README.md", ranges: [{ end: 1, start: 1 }] }],
    }),
  );
  return { repositoryRoot, wikiRoot };
}
