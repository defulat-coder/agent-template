import { stat } from "node:fs/promises";
import path from "node:path";

export async function findZReadWikiRoot(): Promise<string> {
  const configuredRoot = process.env.ZREAD_WIKI_ROOT?.trim();
  const candidates = [
    configuredRoot ? path.resolve(configuredRoot) : undefined,
    path.resolve(process.cwd(), ".zread", "wiki"),
    path.resolve(process.cwd(), "../.zread/wiki"),
    path.resolve(process.cwd(), "../../.zread/wiki"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of new Set(candidates)) {
    try {
      const current = await stat(path.join(candidate, "current"));
      if (current.isFile()) {
        return candidate;
      }
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }
  }

  throw new Error(
    `Unable to locate .zread/wiki/current from ${process.cwd()}; run pnpm docs:zread:update or set ZREAD_WIKI_ROOT`,
  );
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
