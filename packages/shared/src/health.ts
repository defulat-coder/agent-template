import { z } from "zod";

export const DependencyStateSchema = z.object({
  status: z.enum(["ok", "error", "skipped"]),
  message: z.string(),
});

export const HealthStatusSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded"]),
  timestamp: z.string().datetime(),
  database: DependencyStateSchema,
  redis: DependencyStateSchema,
  queue: z.object({
    name: z.string(),
    status: z.enum(["ready", "unavailable"]),
  }),
  agent: z.object({
    runtime: z.enum(["claude", "eve"]),
    configured: z.boolean(),
    model: z.string(),
    readiness: DependencyStateSchema,
  }),
  toolbox: z.object({
    configured: z.boolean(),
    url: z.string().url(),
    capabilityProfile: z.string().min(1),
  }),
});

export type DependencyState = z.infer<typeof DependencyStateSchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export function createHealthStatus(input: HealthStatus): HealthStatus {
  return HealthStatusSchema.parse(input);
}
