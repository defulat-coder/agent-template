import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

for (const [app, entry] of [
  ["api", "server.js"],
  ["worker", "worker.js"],
] as const) {
  const dist = join(repositoryRoot, "apps", app, "dist");
  const entrySource = readFileSync(join(dist, entry), "utf8");
  assert.doesNotMatch(entrySource, /Claude Agent SDK did not return a result/);
  assert.doesNotMatch(entrySource, /Eve runtime .*EVE_AGENT_HOST/);

  const chunks = readdirSync(dist)
    .filter((file) => file.endsWith(".js") && file !== entry)
    .map((file) => ({ file, source: readFileSync(join(dist, file), "utf8") }));
  const claudeChunk = chunks.find((chunk) =>
    chunk.source.includes("Claude Agent SDK did not return a result"),
  );
  const eveChunk = chunks.find((chunk) =>
    chunk.source.includes("EVE_AGENT_HOST"),
  );

  assert.ok(claudeChunk, `${app} build is missing the Claude runtime chunk`);
  assert.ok(eveChunk, `${app} build is missing the Eve runtime chunk`);
  assert.notEqual(
    claudeChunk.file,
    eveChunk.file,
    `${app} build merged both runtimes into one chunk`,
  );
  assert.match(
    entrySource,
    new RegExp(`import\\(\"\\./${claudeChunk.file}\"\\)`),
  );
  assert.match(entrySource, new RegExp(`import\\(\"\\./${eveChunk.file}\"\\)`));
}

console.log(
  "Runtime bundle boundary verification passed: API and Worker entries load Claude and Eve through separate dynamic chunks.",
);
