import { cp, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export type DirectoryOperations = {
  copy: (source: string, destination: string) => Promise<void>;
  remove: (target: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
};

export const fileSystemDirectoryOperations: DirectoryOperations = {
  copy: async (source, destination) => {
    await cp(source, destination, { recursive: true });
  },
  remove: async (target) => {
    await rm(target, { recursive: true, force: true });
  },
  rename,
};

export async function publishDirectoryAtomically(
  source: string,
  destination: string,
  operations: DirectoryOperations = fileSystemDirectoryOperations,
): Promise<void> {
  const suffix = randomUUID();
  const staged = `${destination}.next-${suffix}`;
  const backup = `${destination}.previous-${suffix}`;
  let previousMoved = false;
  let promoted = false;

  await operations.copy(source, staged);

  try {
    try {
      await operations.rename(destination, backup);
      previousMoved = true;
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }

    await operations.rename(staged, destination);
    promoted = true;

    if (previousMoved) {
      await operations.remove(backup);
    }
  } catch (error) {
    if (previousMoved && !promoted) {
      try {
        await operations.rename(backup, destination);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "OpenWiki publication failed and the previous wiki could not be restored",
        );
      }
    }

    throw error;
  } finally {
    await operations.remove(staged);
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
