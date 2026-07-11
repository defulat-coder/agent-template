import assert from "node:assert/strict";
import test from "node:test";
import YAML from "yaml";
import {
  assertAllowedZReadChanges,
  createZReadChildEnvironment,
  createZReadConfigYaml,
  parseZReadVersionOutput,
  resolveZReadProviderConfig,
  validateZReadEventStream,
} from "./policy.js";

test("maps the existing Kimi Anthropic configuration to ZRead OpenAI compatibility", () => {
  assert.deepEqual(
    resolveZReadProviderConfig({
      ANTHROPIC_API_KEY: "secret",
      ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
      ANTHROPIC_MODEL: "kimi-for-coding",
    }),
    {
      apiKey: "secret",
      baseUrl: "https://api.kimi.com/coding/v1",
      model: "kimi-for-coding",
      provider: "openai",
    },
  );
});

test("requires an explicit ZRead base URL for non-Kimi Anthropic endpoints", () => {
  assert.throws(
    () =>
      resolveZReadProviderConfig({
        ANTHROPIC_API_KEY: "secret",
        ANTHROPIC_BASE_URL: "https://provider.example/anthropic",
        ANTHROPIC_MODEL: "model",
      }),
    /ZREAD_LLM_BASE_URL is required/,
  );

  assert.deepEqual(
    resolveZReadProviderConfig({
      ANTHROPIC_API_KEY: "secret",
      ANTHROPIC_MODEL: "model",
      ZREAD_LLM_BASE_URL: "https://provider.example/v1",
    }),
    {
      apiKey: "secret",
      baseUrl: "https://provider.example/v1",
      model: "model",
      provider: "openai",
    },
  );
});

test("writes a valid isolated ZRead config without interpolating YAML", () => {
  const config = YAML.parse(
    createZReadConfigYaml({
      apiKey: 'secret"\nnext: value',
      baseUrl: "https://api.kimi.com/coding/v1",
      model: "kimi-for-coding",
      provider: "openai",
    }),
  );

  assert.deepEqual(config, {
    concurrency: { max_concurrent: 2, max_retries: 1 },
    doc_language: "zh",
    language: "zh",
    llm: {
      api_key: 'secret"\nnext: value',
      base_url: "https://api.kimi.com/coding/v1",
      model: "kimi-for-coding",
      provider: "openai",
    },
  });
});

test("passes only runtime variables and isolated HOME to ZRead", () => {
  assert.deepEqual(
    createZReadChildEnvironment(
      {
        PATH: "/usr/bin",
        LANG: "zh_CN.UTF-8",
        ANTHROPIC_API_KEY: "must-not-leak",
        DATABASE_URL: "must-not-leak",
      },
      "/tmp/zread-home",
    ),
    {
      HOME: "/tmp/zread-home",
      LANG: "zh_CN.UTF-8",
      PATH: "/usr/bin",
    },
  );
});

test("accepts only ZRead workspace output", () => {
  assert.doesNotThrow(() =>
    assertAllowedZReadChanges([
      ".zread/state.json",
      ".zread/wiki/current",
      ".zread/wiki/versions/version/wiki.json",
    ]),
  );
  assert.throws(
    () => assertAllowedZReadChanges([".zread/wiki/current", "README.md"]),
    /ZRead changed forbidden paths: README\.md/,
  );
});

test("requires the pinned ZRead CLI version", () => {
  assert.equal(
    parseZReadVersionOutput(
      '{"vm":{"version":"0.2.13"},"waiting_for":[],"done":true}\n',
      "0.2.13",
    ),
    "0.2.13",
  );
  assert.throws(
    () =>
      parseZReadVersionOutput(
        '{"vm":{"version":"0.2.12"},"done":true}\n',
        "0.2.13",
      ),
    /Expected ZRead CLI 0\.2\.13, received 0\.2\.12/,
  );
});

test("requires a successful terminal stdio event", () => {
  assert.doesNotThrow(() =>
    validateZReadEventStream([
      '{"vm":{"state":"running"},"done":false,"error":""}',
      '{"vm":{"state":"done"},"waiting_for":[],"done":true,"error":""}',
    ]),
  );
  assert.throws(
    () =>
      validateZReadEventStream([
        '{"vm":{"state":"error"},"done":true,"error":"generation failed"}',
      ]),
    /ZRead generation failed: generation failed/,
  );
  assert.throws(
    () => validateZReadEventStream(['{"vm":{"state":"running"}}']),
    /without a terminal done event/,
  );
});
