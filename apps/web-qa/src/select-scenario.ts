import { isScenarioName, scenarioNames } from "./scenarios.js";

const name = process.argv[2];
if (!isScenarioName(name)) {
  console.error(`Usage: pnpm qa:web:scenario <${scenarioNames.join("|")}>`);
  process.exit(1);
}

const fixtureUrl = process.env.WEB_QA_FIXTURE_URL ?? "http://127.0.0.1:14100";
const response = await fetch(`${fixtureUrl}/__qa/scenario`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name }),
});

if (!response.ok) {
  throw new Error(`Web QA fixture rejected ${name} with ${response.status}`);
}

console.info(`Web QA scenario selected: ${name}`);
