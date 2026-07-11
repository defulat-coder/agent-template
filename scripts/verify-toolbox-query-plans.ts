import { strict as assert } from "node:assert";
import { Client } from "pg";
import { getDatabaseUrl } from "@agent-template/db";

const client = new Client({ connectionString: getDatabaseUrl() });

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");
    await seedRepresentativeToolInvocationData();
    await client.query("SET LOCAL enable_seqscan = off");
    await assertPlanUsesIndex(
      `SELECT id
       FROM public."AgentRun"
       WHERE "requestedAt" >= NOW() - INTERVAL '30 days'
       ORDER BY "requestedAt" DESC, id DESC
       LIMIT 20`,
      "AgentRun_requestedAt_id_idx",
    );
    await assertPlanUsesIndex(
      `SELECT id
       FROM public."AgentRun"
       WHERE status = 'failed'
         AND "completedAt" >= NOW() - INTERVAL '1 day'
         AND "completedAt" < NOW() + INTERVAL '1 day'
       ORDER BY "completedAt" DESC, id DESC
       LIMIT 20`,
      "AgentRun_failed_completedAt_id_idx",
    );
    await assertPlanUsesIndexes(
      `WITH call_events AS (
         SELECT
           "runId",
           "executionAttempt",
           payload->>'callId' AS "callId",
           payload->>'toolName' AS "toolName",
           "createdAt" AS "calledAt"
         FROM public."AgentRunEvent"
         WHERE kind = 'tool-call'
           AND "createdAt" >= NOW() - INTERVAL '1 day'
           AND "createdAt" < NOW() + INTERVAL '1 day'
       ),
       result_events AS (
         SELECT
           "runId",
           "executionAttempt",
           payload->>'callId' AS "callId",
           "createdAt" AS "resultAt"
         FROM public."AgentRunEvent"
         WHERE kind = 'tool-result'
       ),
       invocations AS (
         SELECT
           calls."toolName",
           EXTRACT(EPOCH FROM (results."resultAt" - calls."calledAt")) * 1000 AS "latencyMs"
         FROM call_events AS calls
         LEFT JOIN result_events AS results
           ON results."runId" = calls."runId"
           AND results."executionAttempt" = calls."executionAttempt"
           AND results."callId" = calls."callId"
       )
       SELECT
         "toolName",
         COUNT(*)::int AS "invocationCount",
         ROUND(AVG("latencyMs"))::int AS "averageLatencyMs",
         ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs"))::int AS "p95LatencyMs"
       FROM invocations
       WHERE "toolName" IS NOT NULL
       GROUP BY "toolName"
       ORDER BY "invocationCount" DESC, "toolName" ASC
       LIMIT 50`,
      [
        "AgentRunEvent_kind_createdAt_idx",
        "AgentRunEvent_toolResult_correlation_idx",
      ],
    );
    await client.query("ROLLBACK");
    console.log(
      "Toolbox query-plan verification passed: Agent run list, failed-run window, and full Tool call/result correlation use their production indexes.",
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

async function seedRepresentativeToolInvocationData() {
  await client.query(
    `INSERT INTO public."AgentRun" (
       id,
       prompt,
       "requestedAt",
       "completedAt",
       status,
       "executionAttempt",
       "createdAt",
       "updatedAt"
     )
     SELECT
       'toolbox-plan-' || txid_current() || '-' || sample_id,
       'query plan fixture',
       NOW() - INTERVAL '30 minutes',
       NOW() - INTERVAL '29 minutes',
       'completed'::public."AgentRunStatus",
       1,
       NOW() - INTERVAL '30 minutes',
       NOW() - INTERVAL '29 minutes'
     FROM generate_series(1, 10000) AS sample_id`,
  );
  await client.query(
    `INSERT INTO public."AgentRunEvent" (
       id,
       "runId",
       sequence,
       "executionAttempt",
       kind,
       payload,
       "createdAt"
     )
     SELECT
       'toolbox-plan-call-' || txid_current() || '-' || sample_id,
       'toolbox-plan-' || txid_current() || '-' || sample_id,
       1,
       1,
       'tool-call',
       jsonb_build_object(
         'kind', 'tool-call',
         'callId', 'call-' || sample_id,
         'toolName', 'query-plan-tool'
       ),
       CASE
         WHEN sample_id <= 100 THEN NOW() - INTERVAL '30 minutes'
         ELSE NOW() - INTERVAL '60 days'
       END
     FROM generate_series(1, 10000) AS sample_id
     UNION ALL
     SELECT
       'toolbox-plan-result-' || txid_current() || '-' || sample_id,
       'toolbox-plan-' || txid_current() || '-' || sample_id,
       2,
       1,
       'tool-result',
       jsonb_build_object(
         'kind', 'tool-result',
         'callId', 'call-' || sample_id,
         'toolName', 'query-plan-tool',
         'output', 'ok'
       ),
       CASE
         WHEN sample_id <= 100 THEN NOW() - INTERVAL '30 minutes'
         ELSE NOW() - INTERVAL '60 days'
       END + INTERVAL '50 milliseconds'
     FROM generate_series(1, 10000) AS sample_id`,
  );
  await client.query('ANALYZE public."AgentRun"');
  await client.query('ANALYZE public."AgentRunEvent"');
}

async function assertPlanUsesIndex(statement: string, indexName: string) {
  await assertPlanUsesIndexes(statement, [indexName]);
}

async function assertPlanUsesIndexes(statement: string, indexNames: string[]) {
  const result = await client.query<{ "QUERY PLAN": unknown }>(
    `EXPLAIN (FORMAT JSON) ${statement}`,
  );
  const plan = JSON.stringify(result.rows[0]?.["QUERY PLAN"]);
  for (const indexName of indexNames) {
    assert.match(
      plan,
      new RegExp(indexName),
      `${indexName} missing from ${plan}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
