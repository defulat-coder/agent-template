import { z } from "zod";
import { AgentRuntimeEnvSchema } from "@agent-template/agent";
import { defaultDatabaseUrl } from "@agent-template/db/config";

export const EnvSchema = AgentRuntimeEnvSchema.extend({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url().default(defaultDatabaseUrl),
  REDIS_URL: z.string().url().default("redis://localhost:16379"),
  TOOLBOX_URL: z.string().url().default("http://localhost:15000"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(14000),
  AGENT_API_TOKEN: z.string().min(16).optional(),
  AGENT_LEGACY_ROUTES_ENABLED: z.enum(["true", "false"]).optional(),
  CORS_ORIGIN: z.string().default("http://localhost:13000"),
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production" && !env.AGENT_API_TOKEN) {
    context.addIssue({
      code: "custom",
      path: ["AGENT_API_TOKEN"],
      message: "AGENT_API_TOKEN is required in production",
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(
  input: Record<string, string | undefined> = process.env,
): Env {
  return EnvSchema.parse(input);
}

export function areLegacyAgentRoutesEnabled(env: Env): boolean {
  return env.AGENT_LEGACY_ROUTES_ENABLED
    ? env.AGENT_LEGACY_ROUTES_ENABLED === "true"
    : env.NODE_ENV !== "production";
}
