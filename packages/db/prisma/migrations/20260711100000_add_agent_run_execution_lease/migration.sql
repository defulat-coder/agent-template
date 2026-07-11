ALTER TABLE "public"."AgentRun"
  ADD COLUMN "executionAttempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "executionToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "heartbeatAt" TIMESTAMPTZ(3);

-- Let the first post-deploy retry reclaim runs left in progress by the old lifecycle.
UPDATE "public"."AgentRun"
SET "leaseExpiresAt" = CURRENT_TIMESTAMP
WHERE status = 'running' AND "leaseExpiresAt" IS NULL;

CREATE INDEX "AgentRun_status_leaseExpiresAt_idx"
  ON "public"."AgentRun"("status", "leaseExpiresAt");
