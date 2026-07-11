import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { stageCurrentZReadWiki } from "./wiki.js";

test("stages only the active validated ZRead wiki version", async () => {
  const fixture = await createWikiFixture();

  try {
    const snapshot = await stageCurrentZReadWiki(
      fixture.source,
      fixture.destination,
    );

    assert.equal(snapshot.id, "2026-07-11_2030_abc123");
    assert.deepEqual(
      snapshot.pages.map((page) => page.slug),
      ["overview", "architecture/runtime"],
    );
    assert.equal(
      await readFile(path.join(fixture.destination, "current"), "utf8"),
      "2026-07-11_2030_abc123\n",
    );
    await assert.rejects(
      access(path.join(fixture.destination, "versions", "old-version")),
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects current pointers and page files that escape the wiki", async () => {
  const fixture = await createWikiFixture();

  try {
    await writeFile(path.join(fixture.source, "current"), "../outside\n");
    await assert.rejects(
      stageCurrentZReadWiki(fixture.source, fixture.destination),
      /Invalid ZRead current version id/,
    );

    await writeFile(
      path.join(fixture.source, "current"),
      "2026-07-11_2030_abc123\n",
    );
    const manifestPath = path.join(
      fixture.source,
      "versions",
      "2026-07-11_2030_abc123",
      "wiki.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.pages[0].file = "../outside.md";
    await writeFile(manifestPath, JSON.stringify(manifest));

    await assert.rejects(
      stageCurrentZReadWiki(fixture.source, fixture.destination),
      /Invalid ZRead wiki\.json/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects missing pages and malformed generated Markdown", async () => {
  const fixture = await createWikiFixture();
  const versionRoot = path.join(
    fixture.source,
    "versions",
    "2026-07-11_2030_abc123",
  );

  try {
    await rm(path.join(versionRoot, "architecture", "runtime.md"));
    await assert.rejects(
      stageCurrentZReadWiki(fixture.source, fixture.destination),
      /ZRead page file is missing/,
    );

    await mkdir(path.join(versionRoot, "architecture"), { recursive: true });
    await writeFile(
      path.join(versionRoot, "architecture", "runtime.md"),
      "# Runtime\n\n- - duplicated marker",
    );
    await assert.rejects(
      stageCurrentZReadWiki(fixture.source, fixture.destination),
      /malformed list markers/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createWikiFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "zread-wiki-test-"));
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");
  const activeVersion = path.join(source, "versions", "2026-07-11_2030_abc123");
  await mkdir(path.join(activeVersion, "architecture"), { recursive: true });
  await mkdir(path.join(source, "versions", "old-version"), {
    recursive: true,
  });
  await writeFile(path.join(source, "current"), "2026-07-11_2030_abc123\n");
  await writeFile(
    path.join(activeVersion, "wiki.json"),
    JSON.stringify({
      generated_at: "2026-07-11T12:30:00Z",
      id: "2026-07-11_2030_abc123",
      language: "zh",
      pages: [
        {
          file: "overview.md",
          group: "开始",
          level: 1,
          section: "开始",
          slug: "overview",
          title: "项目概览",
        },
        {
          file: "architecture/runtime.md",
          group: "架构",
          level: 1,
          section: "架构",
          slug: "architecture/runtime",
          title: "Runtime 架构",
        },
      ],
    }),
  );
  await writeFile(path.join(activeVersion, "overview.md"), "# 项目概览");
  await writeFile(
    path.join(activeVersion, "architecture", "runtime.md"),
    "# Runtime 架构",
  );
  await writeFile(
    path.join(source, "versions", "old-version", "wiki.json"),
    "{}",
  );
  return { destination, root, source };
}
