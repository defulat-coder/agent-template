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
  CORS_ORIGIN: z.string().default("http://localhost:13000"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(
  input: Record<string, string | undefined> = process.env,
): Env {
  return EnvSchema.parse(input);
}
