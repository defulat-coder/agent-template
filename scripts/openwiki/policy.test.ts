import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAllowedOpenWikiChanges,
  createOpenWikiChildEnvironment,
  resolveOpenWikiProviderConfig,
  validateGeneratedWikiFiles,
} from "./policy.js";

test("accepts generated wiki files and the fixed OpenWiki setup side effects", () => {
  assert.doesNotThrow(() =>
    assertAllowedOpenWikiChanges([
      "openwiki/quickstart.md",
      "openwiki/architecture/overview.md",
      "AGENTS.md",
      "CLAUDE.md",
      ".github/workflows/openwiki-update.yml",
    ]),
  );
});

test("rejects writes outside the generated wiki and fixed setup files", () => {
  assert.throws(
    () =>
      assertAllowedOpenWikiChanges([
        "openwiki/quickstart.md",
        "apps/web/app/page.tsx",
      ]),
    /OpenWiki changed forbidden paths: apps\/web\/app\/page\.tsx/,
  );
});

test("requires a quickstart and at least one generated documentation page", () => {
  assert.doesNotThrow(() =>
    validateGeneratedWikiFiles([
      "INSTRUCTIONS.md",
      "quickstart.md",
      "architecture/overview.md",
    ]),
  );

  assert.throws(
    () => validateGeneratedWikiFiles(["INSTRUCTIONS.md", "quickstart.md"]),
    /at least one generated page besides quickstart/,
  );
});

test("derives Anthropic-compatible provider configuration without exposing secrets", () => {
  assert.deepEqual(
    resolveOpenWikiProviderConfig({
      ANTHROPIC_API_KEY: "secret",
      ANTHROPIC_BASE_URL: "https://provider.example/anthropic",
      ANTHROPIC_MODEL: "provider-model",
    }),
    {
      provider: "anthropic",
      modelId: "provider-model",
    },
  );
});

test("fails fast when provider or model configuration is missing", () => {
  assert.throws(
    () => resolveOpenWikiProviderConfig({}),
    /OpenWiki provider is not configured/,
  );

  assert.throws(
    () =>
      resolveOpenWikiProviderConfig({
        OPENWIKI_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "secret",
      }),
    /OpenWiki model is not configured/,
  );
});

test("passes only runtime and selected provider variables to OpenWiki", () => {
  const childEnvironment = createOpenWikiChildEnvironment(
    {
      PATH: "/usr/bin",
      LANG: "zh_CN.UTF-8",
      DATABASE_URL: "postgresql://secret",
      TOOLBOX_AUTH_TOKEN: "toolbox-secret",
      ANTHROPIC_API_KEY: "provider-secret",
      ANTHROPIC_BASE_URL: "https://provider.example/anthropic",
    },
    "/tmp/openwiki-home",
    { provider: "anthropic", modelId: "provider-model" },
  );

  assert.equal(childEnvironment.DATABASE_URL, undefined);
  assert.equal(childEnvironment.TOOLBOX_AUTH_TOKEN, undefined);
  assert.deepEqual(childEnvironment, {
    PATH: "/usr/bin",
    LANG: "zh_CN.UTF-8",
    HOME: "/tmp/openwiki-home",
    OPENWIKI_PROVIDER: "anthropic",
    OPENWIKI_MODEL_ID: "provider-model",
    ANTHROPIC_API_KEY: "provider-secret",
    ANTHROPIC_BASE_URL: "https://provider.example/anthropic",
  });
});
