// ZRead native on-disk contract regression tests.
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
import { stageNativeZReadWiki } from "./wiki.js";

test("stages the complete native ZRead directory without rewriting files", async () => {
  const fixture = await createWikiFixture();

  try {
    const manifestBefore = await readFile(fixture.manifestPath, "utf8");
    const snapshot = await stageNativeZReadWiki(
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
      "versions/2026-07-11_2030_abc123\n",
    );
    assert.equal(
      await readFile(
        path.join(
          fixture.destination,
          "versions",
          "2026-07-11_2030_abc123",
          "wiki.json",
        ),
        "utf8",
      ),
      manifestBefore,
    );
    assert.equal(
      await readFile(
        path.join(fixture.destination, "versions", "old-version", "wiki.json"),
        "utf8",
      ),
      "{}",
    );
    await assert.rejects(
      access(
        path.join(
          fixture.destination,
          "versions",
          "2026-07-11_2030_abc123",
          "sources.json",
        ),
      ),
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("accepts both native current pointer forms without normalizing them", async () => {
  const fixture = await createWikiFixture();

  try {
    await writeFile(
      path.join(fixture.source, "current"),
      "2026-07-11_2030_abc123\n",
    );
    await stageNativeZReadWiki(fixture.source, fixture.destination);

    assert.equal(
      await readFile(path.join(fixture.destination, "current"), "utf8"),
      "2026-07-11_2030_abc123\n",
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
      stageNativeZReadWiki(fixture.source, fixture.destination),
      /Invalid ZRead current version id/,
    );

    await writeFile(
      path.join(fixture.source, "current"),
      "versions/2026-07-11_2030_abc123\n",
    );
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    manifest.pages[0].file = "../outside.md";
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));

    await assert.rejects(
      stageNativeZReadWiki(fixture.source, fixture.destination),
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
      stageNativeZReadWiki(fixture.source, fixture.destination),
      /ZRead page file.*is missing/,
    );

    await mkdir(path.join(versionRoot, "architecture"), { recursive: true });
    await writeFile(
      path.join(versionRoot, "architecture", "runtime.md"),
      "# Runtime\n\n- - duplicated marker",
    );
    await assert.rejects(
      stageNativeZReadWiki(fixture.source, fixture.destination),
      /malformed list markers/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("validates cited source files and starting line ranges", async () => {
  const fixture = await createWikiFixture();
  const overview = path.join(
    fixture.source,
    "versions",
    "2026-07-11_2030_abc123",
    "overview.md",
  );

  try {
    await writeFile(overview, "Sources: [missing](src/missing.ts#L1-L2)");
    await assert.rejects(
      stageNativeZReadWiki(fixture.source, fixture.destination),
      /cited source file.*is missing/,
    );

    await writeFile(overview, "Sources: [app](src/app.ts#L1-L99)");
    await stageNativeZReadWiki(fixture.source, fixture.destination);

    await rm(fixture.destination, { recursive: true, force: true });
    await writeFile(overview, "Sources: [app](src/app.ts#L99-L100)");
    await assert.rejects(
      stageNativeZReadWiki(fixture.source, fixture.destination),
      /source start .* exceeds 3 lines/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("validates inactive native versions and drafts before copying them", async () => {
  const fixture = await createWikiFixture();
  const draft = path.join(fixture.source, "drafts", "next", "draft.md");

  try {
    await mkdir(path.dirname(draft), { recursive: true });
    await writeFile(draft, "credential-marker");

    await assert.rejects(
      stageNativeZReadWiki(
        fixture.source,
        fixture.destination,
        (content, label) => {
          if (content.includes("credential-marker")) {
            throw new Error(`unsafe content in ${label}`);
          }
        },
      ),
      /unsafe content in ZRead native wiki file drafts\/next\/draft\.md/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createWikiFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "zread-wiki-test-"));
  const repository = path.join(root, "repository");
  const source = path.join(repository, ".zread", "wiki");
  const destination = path.join(root, "destination");
  const activeVersion = path.join(source, "versions", "2026-07-11_2030_abc123");
  const manifestPath = path.join(activeVersion, "wiki.json");
  await mkdir(path.join(activeVersion, "architecture"), { recursive: true });
  await mkdir(path.join(source, "versions", "old-version"), {
    recursive: true,
  });
  await writeFile(
    path.join(source, "current"),
    "versions/2026-07-11_2030_abc123\n",
  );
  await writeFile(
    manifestPath,
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
          file: "architecture/runtime.md",
          level: 1,
          section: "架构",
          slug: "architecture/runtime",
          title: "Runtime 架构",
        },
      ],
    }),
  );
  await mkdir(path.join(repository, "src"), { recursive: true });
  await writeFile(path.join(repository, "README.md"), "# 项目\n\n说明");
  await writeFile(
    path.join(repository, "src", "app.ts"),
    "export const app = true;\nexport default app;\n",
  );
  await writeFile(
    path.join(activeVersion, "overview.md"),
    "# 项目概览\n\nSources: [README](README.md#L1-L2)",
  );
  await writeFile(
    path.join(activeVersion, "architecture", "runtime.md"),
    "# Runtime 架构\n\nSources: [app](src/app.ts#L1-L2)",
  );
  await writeFile(
    path.join(source, "versions", "old-version", "wiki.json"),
    "{}",
  );
  return { destination, manifestPath, root, source };
}
