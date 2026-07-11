CREATE INDEX "AgentRun_requestedAt_id_idx"
  ON "public"."AgentRun"("requestedAt" DESC, id DESC);

CREATE INDEX "AgentRun_failed_completedAt_id_idx"
  ON "public"."AgentRun"("completedAt" DESC, id DESC)
  WHERE status = 'failed';

CREATE INDEX "AgentRunEvent_kind_createdAt_idx"
  ON "public"."AgentRunEvent"(kind, "createdAt");

DROP INDEX IF EXISTS "public"."AgentRunEvent_runId_executionAttempt_kind_idx";
