-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM (
  'queued',
  'running',
  'completed',
  'failed',
  'skipped',
  'cancelled'
);

-- CreateTable
CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "cancelRequestedAt" TIMESTAMPTZ(3),
  "status" "AgentRunStatus" NOT NULL,
  "runtime" TEXT,
  "model" TEXT,
  "output" TEXT,
  "reason" TEXT,
  "sessionId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunEvent" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunEvent_runId_sequence_key" ON "AgentRunEvent"("runId", "sequence");

-- CreateIndex
CREATE INDEX "AgentRunEvent_runId_createdAt_idx" ON "AgentRunEvent"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentRunEvent"
ADD CONSTRAINT "AgentRunEvent_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "AgentRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
