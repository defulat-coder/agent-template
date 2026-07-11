import { strict as assert } from "node:assert";
import { Client } from "pg";
import { getDatabaseUrl } from "@agent-template/db";

const client = new Client({ connectionString: getDatabaseUrl() });

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");
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
    await assertPlanUsesIndex(
      `SELECT "runId", "executionAttempt", payload
       FROM public."AgentRunEvent"
       WHERE kind = 'tool-call'
         AND "createdAt" >= NOW() - INTERVAL '1 day'
         AND "createdAt" < NOW() + INTERVAL '1 day'`,
      "AgentRunEvent_kind_createdAt_idx",
    );
    await client.query("ROLLBACK");
    console.log(
      "Toolbox query-plan verification passed: Agent run list, failed-run window, and Tool invocation scans use their production indexes.",
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

async function assertPlanUsesIndex(statement: string, indexName: string) {
  const result = await client.query<{ "QUERY PLAN": unknown }>(
    `EXPLAIN (FORMAT JSON) ${statement}`,
  );
  const plan = JSON.stringify(result.rows[0]?.["QUERY PLAN"]);
  assert.match(
    plan,
    new RegExp(indexName),
    `${indexName} missing from ${plan}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
