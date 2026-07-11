ALTER TABLE public."AgentRun"
  RENAME COLUMN "sessionId" TO "runtimeSessionId";

CREATE TABLE public."AgentConversation" (
  id TEXT NOT NULL,
  title TEXT,
  runtime TEXT NOT NULL,
  "runtimeContinuationState" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AgentConversation_pkey" PRIMARY KEY (id)
);

ALTER TABLE public."AgentRun"
  ADD COLUMN "conversationId" TEXT;

ALTER TABLE public."AgentRun"
  ADD CONSTRAINT "AgentRun_conversationId_fkey"
  FOREIGN KEY ("conversationId")
  REFERENCES public."AgentConversation"(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "AgentConversation_updatedAt_id_idx"
  ON public."AgentConversation"("updatedAt", id);

CREATE INDEX "AgentRun_conversationId_createdAt_idx"
  ON public."AgentRun"("conversationId", "createdAt");

CREATE UNIQUE INDEX "AgentRun_one_active_per_conversation_idx"
  ON public."AgentRun"("conversationId")
  WHERE "conversationId" IS NOT NULL
    AND status IN ('queued', 'running');
