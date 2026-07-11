import { getAgentRuntimeStateFromEnv } from "@agent-template/agent";
import {
  createHealthStatus,
  agentQueueName,
  type DependencyState,
  type HealthStatus,
} from "@agent-template/shared";
import { createRedisPingConnection } from "./queue.js";
import type { Env } from "./env.js";

export type HealthOptions = {
  checkExternal: boolean;
  adapters?: HealthAdapters;
};

export type HealthAdapters = {
  database(): Promise<DependencyState>;
  redis(): Promise<DependencyState>;
  now(): string;
};

async function checkDatabase(): Promise<DependencyState> {
  try {
    const { prisma } = await import("@agent-template/db");
    await withTimeout(
      prisma.$queryRaw`SELECT 1`,
      800,
      "PostgreSQL check timed out",
    );
    return { status: "ok", message: "PostgreSQL reachable" };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "PostgreSQL check failed";

    return {
      status: "error",
      message,
    };
  }
}

async function checkRedis(redisUrl: string): Promise<DependencyState> {
  const redis = createRedisPingConnection(redisUrl);
  redis.on("error", () => {
    // Health checks report Redis errors in the response instead of emitting noisy client errors.
  });

  try {
    await withTimeout(
      redis.connect().then(() => redis.ping()),
      800,
      "Redis check timed out",
    );
    return { status: "ok", message: "Redis reachable" };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Redis check failed";

    return {
      status: "error",
      message,
    };
  } finally {
    redis.disconnect();
  }
}

function createSkippedAdapters(): HealthAdapters {
  return {
    database: async () => ({
      status: "skipped",
      message: "external checks disabled",
    }),
    redis: async () => ({
      status: "skipped",
      message: "external checks disabled",
    }),
    now: () => new Date().toISOString(),
  };
}

function createDefaultAdapters(env: Env): HealthAdapters {
  return {
    database: checkDatabase,
    redis: () => checkRedis(env.REDIS_URL),
    now: () => new Date().toISOString(),
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function getHealth(
  env: Env,
  options: HealthOptions,
): Promise<HealthStatus> {
  const adapters =
    options.adapters ??
    (options.checkExternal
      ? createDefaultAdapters(env)
      : createSkippedAdapters());
  const [database, redis] = await Promise.all([
    adapters.database(),
    adapters.redis(),
  ]);
  const status =
    database.status === "error" || redis.status === "error" ? "degraded" : "ok";

  return createHealthStatus({
    service: "api",
    status,
    timestamp: adapters.now(),
    database,
    redis,
    queue: {
      name: agentQueueName,
      status: redis.status === "error" ? "unavailable" : "ready",
    },
    agent: getAgentRuntimeStateFromEnv(env),
    toolbox: {
      configured: Boolean(env.TOOLBOX_URL),
      url: env.TOOLBOX_URL,
      capabilityProfile: env.AGENT_CAPABILITY_PROFILE,
    },
  });
}
