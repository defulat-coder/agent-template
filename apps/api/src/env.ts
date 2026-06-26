import { z } from "zod";
import { defaultClaudeAgentModel } from "@project-template/agent";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgresql://project_template:project_template@localhost:55432/project_template?schema=public"),
  REDIS_URL: z.string().url().default("redis://localhost:56379"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_AGENT_MODEL: z.string().default(defaultClaudeAgentModel)
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(input: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(input);
}
