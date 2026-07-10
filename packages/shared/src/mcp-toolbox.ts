import { z } from "zod";

const maxMcpToolboxWindowMs = 31 * 24 * 60 * 60 * 1000;

export const McpToolboxRunIdSchema = z.string().min(1).max(200);
export const McpToolboxLimitSchema = z.number().int().min(1).max(100);
export const McpToolboxTimelineLimitSchema = z.number().int().min(1).max(200);
export const McpToolboxTimestampSchema = z.string().datetime({ offset: true });

const McpToolboxTimeWindowFields = {
  from: McpToolboxTimestampSchema,
  to: McpToolboxTimestampSchema,
};

function validateMcpToolboxTimeWindow(
  input: { from: string; to: string },
  ctx: z.RefinementCtx,
) {
  const from = Date.parse(input.from);
  const to = Date.parse(input.to);

  if (from >= to) {
    ctx.addIssue({
      code: "custom",
      message: "to must be later than from",
      path: ["to"],
    });
    return;
  }

  if (to - from > maxMcpToolboxWindowMs) {
    ctx.addIssue({
      code: "custom",
      message: "time window must not exceed 31 days",
      path: ["to"],
    });
  }
}

export const McpToolboxTimeWindowSchema = z
  .object(McpToolboxTimeWindowFields)
  .superRefine(validateMcpToolboxTimeWindow);

export const McpToolboxTimeWindowWithLimitSchema = z
  .object({
    ...McpToolboxTimeWindowFields,
    limit: McpToolboxLimitSchema.optional(),
  })
  .superRefine(validateMcpToolboxTimeWindow);

export const McpToolboxRunTimelineInputSchema = z.object({
  runId: McpToolboxRunIdSchema,
  limit: McpToolboxTimelineLimitSchema.optional(),
});

export const McpToolboxRunSummaryInputSchema = z.object({
  runId: McpToolboxRunIdSchema,
});
