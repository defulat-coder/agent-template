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

test("exposes only safe source files cited by active manifest pages", async () => {
  const { repositoryRoot, wikiRoot } = await createFixture();
  await writeFile(path.join(repositoryRoot, "README.md"), "# Project\n");
  await writeFile(path.join(repositoryRoot, "secret.txt"), "not cited\n");

  assert.deepEqual(await listZReadSourcePaths(wikiRoot), ["README.md"]);
  assert.deepEqual(await readZReadSourceFile(wikiRoot, ["README.md"]), {
    content: "# Project\n",
    sourcePath: "README.md",
  });
  assert.equal(await readZReadSourceFile(wikiRoot, ["secret.txt"]), null);
});

test("derives the allowlist only from pages closed by the native manifest", async () => {
  const { repositoryRoot, versionRoot, wikiRoot } = await createFixture();
  await writeFile(path.join(repositoryRoot, "README.md"), "# Project\n");
  await writeFile(path.join(repositoryRoot, "hidden.ts"), "export {}\n");
  await writeFile(
    path.join(versionRoot, "unlisted.md"),
    "[hidden](hidden.ts#L1)",
  );

  assert.deepEqual(await listZReadSourcePaths(wikiRoot), ["README.md"]);
  assert.equal(await readZReadSourceFile(wikiRoot, ["hidden.ts"]), null);
});

test("fails the catalog when an active page cites an unreadable source", async () => {
  const { wikiRoot } = await createFixture();

  await assert.rejects(
    listZReadSourcePaths(wikiRoot),
    /ZRead cited source is unreadable: README\.md/,
  );
});

async function createFixture() {
  const repositoryRoot = await mkdtemp(
    path.join(tmpdir(), "zread-sources-test-"),
  );
  temporaryRoots.push(repositoryRoot);
  const wikiRoot = path.join(repositoryRoot, ".zread", "wiki");
  const versionRoot = path.join(wikiRoot, "versions", "2026-07-11_2030_abc123");
  await mkdir(versionRoot, { recursive: true });
  await writeFile(
    path.join(wikiRoot, "current"),
    "versions/2026-07-11_2030_abc123\n",
  );
  await writeFile(
    path.join(versionRoot, "wiki.json"),
    JSON.stringify({
      generated_at: "2026-07-11T12:30:00Z",
      id: "2026-07-11_2030_abc123",
      language: "zh",
      pages: [
        {
          file: "overview.md",
          level: 1,
          section: "开始",
          slug: "overview",
          title: "项目概览",
        },
        {
          file: "architecture.md",
          level: "Intermediate",
          section: "架构",
          slug: "architecture",
          title: "架构",
        },
      ],
    }),
  );
  await writeFile(
    path.join(versionRoot, "overview.md"),
    "# 项目概览\n\n[README](README.md#L1)",
  );
  await writeFile(path.join(versionRoot, "architecture.md"), "# 架构\n");
  return { repositoryRoot, versionRoot, wikiRoot };
}
