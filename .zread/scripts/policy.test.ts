// ZRead process policy regression tests.
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAllowedZReadChanges,
  createZReadChildEnvironment,
} from "./policy.js";

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
    () =>
      assertAllowedZReadChanges([
        ".zread/wiki/current",
        ".zread/config/provider.kimi.yaml",
        "README.md",
      ]),
    /ZRead changed forbidden paths: \.zread\/config\/provider\.kimi\.yaml, README\.md/,
  );
});
