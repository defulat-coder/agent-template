import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { listZReadDocuments, readZReadDocument } from "./zread-catalog";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("uses the active ZRead manifest as the ordered docs catalog", async () => {
  const root = await createWiki();

  assert.deepEqual(await listZReadDocuments(root), [
    {
      href: "/docs",
      relativePath: "overview.md",
      section: "开始",
      slug: [],
      sourceSlug: "overview",
      title: "项目概览",
    },
    {
      href: "/docs/architecture/runtime",
      relativePath: "architecture/runtime.md",
      section: "架构",
      slug: ["architecture", "runtime"],
      sourceSlug: "architecture/runtime",
      title: "Runtime 架构",
    },
  ]);
});

test("reads the first manifest page for /docs and returns null for missing slugs", async () => {
  const root = await createWiki();

  assert.deepEqual(await readZReadDocument(root, []), {
    content: "# 项目概览\n\n正文。",
    href: "/docs",
    relativePath: "overview.md",
    section: "开始",
    slug: [],
    sourceSlug: "overview",
    title: "项目概览",
  });
  assert.equal(await readZReadDocument(root, ["missing"]), null);
});

test("rejects requested traversal and manifest files outside the active version", async () => {
  const root = await createWiki();

  assert.equal(await readZReadDocument(root, ["..", "outside"]), null);
  assert.equal(await readZReadDocument(root, ["architecture/runtime"]), null);

  const manifestPath = path.join(
    root,
    "versions",
    "2026-07-11_2030_abc123",
    "wiki.json",
  );
  const manifest = createManifest();
  manifest.pages[0]!.file = "../outside.md";
  await writeFile(manifestPath, JSON.stringify(manifest));

  await assert.rejects(listZReadDocuments(root), /Invalid ZRead wiki\.json/);
});

async function createWiki(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "zread-catalog-"));
  temporaryRoots.push(root);
  const versionRoot = path.join(root, "versions", "2026-07-11_2030_abc123");
  await mkdir(path.join(versionRoot, "architecture"), { recursive: true });
  await writeFile(path.join(root, "current"), "2026-07-11_2030_abc123\n");
  await writeFile(
    path.join(versionRoot, "wiki.json"),
    JSON.stringify(createManifest()),
  );
  await writeFile(
    path.join(versionRoot, "overview.md"),
    "# 项目概览\n\n正文。",
  );
  await writeFile(
    path.join(versionRoot, "architecture", "runtime.md"),
    "# Runtime 架构",
  );
  return root;
}

function createManifest() {
  return {
    generated_at: "2026-07-11T12:30:00Z",
    id: "2026-07-11_2030_abc123",
    language: "zh",
    pages: [
      {
        file: "overview.md",
        group: "开始",
        level: "1",
        section: "开始",
        slug: "overview",
        title: "项目概览",
      },
      {
        file: "architecture/runtime.md",
        group: "架构",
        level: "1",
        section: "架构",
        slug: "architecture/runtime",
        title: "Runtime 架构",
      },
    ],
  };
}
