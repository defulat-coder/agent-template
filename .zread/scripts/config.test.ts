import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";
import { composeProjectZReadConfig } from "./config.js";

test("merges multiple project config fragments and injects the existing Kimi key", async () => {
  const directory = await createConfigFixture();

  try {
    const loaded = await composeProjectZReadConfig(directory, {
      ANTHROPIC_API_KEY: 'secret"\nnext: value',
      ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
      ANTHROPIC_MODEL: "kimi-for-coding",
    });

    assert.deepEqual(loaded.files, ["base.yaml", "provider.yaml"]);
    assert.deepEqual(YAML.parse(loaded.yaml), {
      concurrency: { max_concurrent: 10, max_retries: 1 },
      doc_language: "zh",
      language: "zh",
      llm: {
        api_key: 'secret"\nnext: value',
        base_url: "https://api.kimi.com/coding/v1",
        model: "kimi-for-coding",
        provider: "openai",
      },
    });
    assert.throws(
      () =>
        loaded.assertSafeText(
          'generated content contains secret"\nnext: value',
          "generated content",
        ),
      /generated content contains the configured provider credential/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects secrets and unsafe or duplicate fragment paths", async () => {
  const directory = await createConfigFixture();

  try {
    await writeFile(
      path.join(directory, "provider.yaml"),
      "llm:\n  provider: openai\n  model: model\n  base_url: https://example.com/v1\n  api_key: secret\n",
    );
    await assert.rejects(
      composeProjectZReadConfig(directory, { ANTHROPIC_API_KEY: "secret" }),
      /must not contain llm\.api_key/,
    );

    await writeFile(
      path.join(directory, "index.yaml"),
      "files:\n  - ../outside.yaml\n",
    );
    await assert.rejects(
      composeProjectZReadConfig(directory, { ANTHROPIC_API_KEY: "secret" }),
      /Invalid ZRead config fragment path/,
    );

    await writeFile(
      path.join(directory, "index.yaml"),
      "files:\n  - base.yaml\n  - base.yaml\n",
    );
    await assert.rejects(
      composeProjectZReadConfig(directory, { ANTHROPIC_API_KEY: "secret" }),
      /Duplicate ZRead config fragment/,
    );

    await writeFile(
      path.join(directory, "index.yaml"),
      "files:\n  - base.yaml\n  - provider.yaml\n",
    );
    await writeFile(
      path.join(directory, "provider.yaml"),
      "constructor:\n  prototype: polluted\n",
    );
    await assert.rejects(
      composeProjectZReadConfig(directory, { ANTHROPIC_API_KEY: "secret" }),
      /Unsafe ZRead config key/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects cross-family provider tuples instead of mixing credentials", async () => {
  const directory = await createConfigFixture();

  try {
    await assert.rejects(
      composeProjectZReadConfig(directory, {
        OPENAI_API_KEY: "openai-secret",
        ANTHROPIC_BASE_URL: "https://api.kimi.com/coding",
        ANTHROPIC_MODEL: "kimi-for-coding",
      }),
      /Multiple ZRead provider environment profiles are active/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function createConfigFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "zread-config-test-"));
  await writeFile(
    path.join(directory, "index.yaml"),
    "files:\n  - base.yaml\n  - provider.yaml\n",
  );
  await writeFile(
    path.join(directory, "base.yaml"),
    [
      "language: zh",
      "doc_language: zh",
      "concurrency:",
      "  max_concurrent: 10",
      "  max_retries: 1",
      "llm:",
      "  provider: openai",
      "  model: default-model",
      "  base_url: https://example.com/v1",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(directory, "provider.yaml"),
    "llm:\n  model: kimi-for-coding\n",
  );
  return directory;
}
