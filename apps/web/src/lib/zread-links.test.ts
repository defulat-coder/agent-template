import assert from "node:assert/strict";
import { test } from "vitest";
import { createZReadHeadingId, resolveZReadHref } from "./zread-links";

test("rewrites relative Markdown links into docs routes", () => {
  const knownSlugs = new Set([
    "architecture/overview",
    "domain/concepts",
    "operations/testing",
  ]);
  assert.equal(
    resolveZReadHref(
      ["architecture", "overview"],
      "../domain/concepts.md#tool",
      "architecture/overview",
      knownSlugs,
    ),
    "/docs/domain/concepts#tool",
  );
  assert.equal(
    resolveZReadHref(
      ["operations", "local-dev"],
      "./testing.md",
      "architecture/overview",
      knownSlugs,
    ),
    "/docs/operations/testing",
  );
  assert.equal(
    resolveZReadHref(
      [],
      "architecture/overview.md",
      "architecture/overview",
      knownSlugs,
    ),
    "/docs",
  );
});

test("keeps anchors, external URLs and non-Markdown assets unchanged", () => {
  const knownSlugs = new Set<string>();
  assert.equal(
    resolveZReadHref(
      ["domain", "concepts"],
      "#runtime",
      "overview",
      knownSlugs,
    ),
    "#runtime",
  );
  assert.equal(
    resolveZReadHref([], "https://example.com/docs", "overview", knownSlugs),
    "https://example.com/docs",
  );
  assert.equal(
    resolveZReadHref([], "./diagram.svg", "overview", knownSlugs),
    "./diagram.svg",
  );
});

test("rewrites extensionless ZRead slugs without treating source Markdown as Wiki pages", () => {
  const knownSlugs = new Set(["1-xiang-mu-gai-lan", "2-kuai-su-qi-dong"]);

  assert.equal(
    resolveZReadHref([], "2-kuai-su-qi-dong", "1-xiang-mu-gai-lan", knownSlugs),
    "/docs/2-kuai-su-qi-dong",
  );
  assert.equal(
    resolveZReadHref(
      [],
      "1-xiang-mu-gai-lan",
      "1-xiang-mu-gai-lan",
      knownSlugs,
    ),
    "/docs",
  );
  assert.equal(
    resolveZReadHref([], "README.md#L1-L9", "1-xiang-mu-gai-lan", knownSlugs),
    "README.md#L1-L9",
  );
});

test("rewrites ZRead source citations to local source routes", () => {
  const knownSourcePaths = new Set([
    "packages/agent/src/index.ts",
    "README.md",
  ]);
  assert.equal(
    resolveZReadHref(
      [],
      "packages/agent/src/index.ts#L1-L321",
      "1-xiang-mu-gai-lan",
      new Set(["1-xiang-mu-gai-lan"]),
      knownSourcePaths,
    ),
    "/docs/source/packages/agent/src/index.ts#L1",
  );
  assert.equal(
    resolveZReadHref(
      [],
      "README.md#L1-L147",
      "1-xiang-mu-gai-lan",
      new Set(["1-xiang-mu-gai-lan"]),
      knownSourcePaths,
    ),
    "/docs/source/README.md#L1",
  );
  assert.equal(
    resolveZReadHref(
      [],
      "README.md",
      "1-xiang-mu-gai-lan",
      new Set(["1-xiang-mu-gai-lan"]),
      knownSourcePaths,
    ),
    "/docs/source/README.md",
  );
});

test("does not expose source paths that were not cited by the active Wiki", () => {
  assert.equal(
    resolveZReadHref(
      [],
      ".env#L1-L2",
      "overview",
      new Set(["overview"]),
      new Set(["README.md"]),
    ),
    ".env#L1-L2",
  );
});

test("does not turn traversal outside the wiki into an application route", () => {
  assert.equal(
    resolveZReadHref([], "../README.md", "overview", new Set()),
    "../README.md",
  );
});

test("creates stable heading ids for Markdown anchor links", () => {
  assert.equal(
    createZReadHeadingId("ADR-0014: Platform-Owned Agent Conversations"),
    "adr-0014-platform-owned-agent-conversations",
  );
  assert.equal(createZReadHeadingId("本地开发与验证"), "本地开发与验证");
});
