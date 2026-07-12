import type { HealthStatus } from "@agent-template/shared";
import { createServerAgentClient } from "./server-agent-client";

export type HealthResult =
  | {
      ok: true;
      data: HealthStatus;
    }
  | {
      ok: false;
      error: string;
    };

export async function fetchHealth(): Promise<HealthResult> {
  try {
    return { ok: true, data: await createServerAgentClient().health() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to load health status",
    };
  }
}
