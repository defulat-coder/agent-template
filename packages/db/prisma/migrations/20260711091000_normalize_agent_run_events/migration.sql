-- Migrate the ambiguous v1 tool event payload into the correlated v2 protocol.
UPDATE "AgentRunEvent"
SET
  "payload" = jsonb_build_object(
    'kind', 'tool-call',
    'callId', 'legacy:' || "id",
    'toolName', COALESCE("payload" ->> 'toolName', "payload" ->> 'tool', 'unknown'),
    'input', COALESCE("payload" -> 'input', '{}'::jsonb)
  ),
  "kind" = 'tool-call'
WHERE "kind" = 'tool-call'
  AND NOT ("payload" ? 'callId');

UPDATE "AgentRunEvent"
SET
  "payload" = jsonb_build_object(
    'kind', 'tool-result',
    'callId', COALESCE("payload" ->> 'callId', 'legacy:' || "id"),
    'toolName', COALESCE("payload" ->> 'toolName', 'unknown')
  ),
  "kind" = 'tool-result'
WHERE "kind" = 'tool-result'
  AND NOT ("payload" ? 'callId');
