-- CreateIndex
CREATE INDEX "TemplateEvent_createdAt_idx" ON "TemplateEvent"("createdAt");

-- CreateIndex
CREATE INDEX "TemplateEvent_type_createdAt_idx" ON "TemplateEvent"("type", "createdAt");

-- Prisma does not model expression indexes. This keeps concrete run lookups and
-- bounded timeline scans index-backed without promoting runId out of payload.
CREATE INDEX "TemplateEvent_runId_createdAt_idx"
ON "TemplateEvent" ((payload->>'runId'), "createdAt");
