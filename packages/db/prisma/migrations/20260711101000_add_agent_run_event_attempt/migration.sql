ALTER TABLE "public"."AgentRunEvent"
  ADD COLUMN "executionAttempt" INTEGER;

CREATE INDEX "AgentRunEvent_runId_executionAttempt_kind_idx"
  ON "public"."AgentRunEvent"("runId", "executionAttempt", kind);
