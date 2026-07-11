import assert from "node:assert/strict";
import { test } from "vitest";
import { createZReadHeadingId, resolveZReadHref } from "./zread-links";

test("rewrites relative Markdown links into docs routes", () => {
  assert.equal(
    resolveZReadHref(
      ["architecture", "overview"],
      "../domain/concepts.md#tool",
    ),
    "/docs/domain/concepts#tool",
  );
  assert.equal(
    resolveZReadHref(["operations", "local-dev"], "./testing.md"),
    "/docs/operations/testing",
  );
  assert.equal(
    resolveZReadHref([], "architecture/overview.md"),
    "/docs/architecture/overview",
  );
});

test("keeps anchors, external URLs and non-Markdown assets unchanged", () => {
  assert.equal(
    resolveZReadHref(["domain", "concepts"], "#runtime"),
    "#runtime",
  );
  assert.equal(
    resolveZReadHref([], "https://example.com/docs"),
    "https://example.com/docs",
  );
  assert.equal(resolveZReadHref([], "./diagram.svg"), "./diagram.svg");
});

test("does not turn traversal outside the wiki into an application route", () => {
  assert.equal(resolveZReadHref([], "../README.md"), "../README.md");
});

test("creates stable heading ids for Markdown anchor links", () => {
  assert.equal(
    createZReadHeadingId("ADR-0014: Platform-Owned Agent Conversations"),
    "adr-0014-platform-owned-agent-conversations",
  );
  assert.equal(createZReadHeadingId("本地开发与验证"), "本地开发与验证");
});
