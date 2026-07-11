import { createHash, timingSafeEqual } from "node:crypto";

export function matchesEveServiceToken(
  provided: string | null,
  expected: string,
) {
  if (!provided) return false;

  return timingSafeEqual(digest(provided), digest(expected));
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}
