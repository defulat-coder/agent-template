-- Prisma does not model partial expression indexes. Keep the Tool invocation
-- call/result correlation access path beside the production SQL plan verifier.
CREATE INDEX "AgentRunEvent_toolResult_correlation_idx"
  ON "public"."AgentRunEvent"(
    "runId",
    "executionAttempt",
    ((payload->>'callId'))
  )
  INCLUDE ("createdAt")
  WHERE kind = 'tool-result';
