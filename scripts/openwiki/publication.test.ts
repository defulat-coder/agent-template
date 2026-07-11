import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  fileSystemDirectoryOperations,
  publishDirectoryAtomically,
} from "./publication.js";

test("replaces the current wiki after the staged copy is complete", async () => {
  const fixture = await createFixture();

  try {
    await publishDirectoryAtomically(fixture.source, fixture.destination);

    assert.equal(
      await readFile(path.join(fixture.destination, "quickstart.md"), "utf8"),
      "new wiki",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("restores the previous wiki when promotion fails", async () => {
  const fixture = await createFixture();
  let renameCalls = 0;

  try {
    await assert.rejects(
      publishDirectoryAtomically(fixture.source, fixture.destination, {
        ...fileSystemDirectoryOperations,
        rename: async (from, to) => {
          renameCalls += 1;
          if (renameCalls === 2) {
            throw new Error("simulated promotion failure");
          }
          await fileSystemDirectoryOperations.rename(from, to);
        },
      }),
      /simulated promotion failure/,
    );

    assert.equal(
      await readFile(path.join(fixture.destination, "quickstart.md"), "utf8"),
      "old wiki",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "openwiki-publication-test-"));
  const source = path.join(root, "source");
  const destination = path.join(root, "openwiki");
  await mkdir(source);
  await mkdir(destination);
  await writeFile(path.join(source, "quickstart.md"), "new wiki");
  await writeFile(path.join(destination, "quickstart.md"), "old wiki");
  return { root, source, destination };
}
