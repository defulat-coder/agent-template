import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { checkAgentRuntimeReadinessFromEnv } from "@agent-template/agent";
import { startLocalToolbox } from "./toolbox/local-toolbox-server.js";

const toolboxConfigPath = fileURLToPath(
  new URL("../apps/toolbox/tools.yaml", import.meta.url),
);

async function main() {
  const toolbox = await startLocalToolbox({
    configPath: toolboxConfigPath,
    env: {
      TOOLBOX_POSTGRES_DATABASE:
        process.env.TOOLBOX_POSTGRES_DATABASE ?? "project_template",
      TOOLBOX_POSTGRES_HOST: process.env.TOOLBOX_POSTGRES_HOST ?? "127.0.0.1",
      TOOLBOX_POSTGRES_PASSWORD:
        process.env.TOOLBOX_POSTGRES_PASSWORD ?? "project_template",
      TOOLBOX_POSTGRES_PORT: process.env.TOOLBOX_POSTGRES_PORT ?? "15432",
      TOOLBOX_POSTGRES_USER:
        process.env.TOOLBOX_POSTGRES_USER ?? "project_template",
    },
  });

  try {
    const readiness = await waitForReadiness(toolbox.url);
    assert.equal(
      readiness.status,
      "ok",
      `${readiness.message}\nToolbox URL: ${toolbox.url}\n${toolbox.getLogs()}`,
    );
    assert.match(readiness.message, /Toolbox 已就绪/);

    console.log(
      "Local Agent runtime readiness verification passed: the selected Claude runtime initialized a real Toolbox MCP connection and resolved its capability profile.",
    );
  } finally {
    await toolbox.stop();
  }
}

async function waitForReadiness(toolboxUrl: string) {
  let readiness = await checkReadiness(toolboxUrl);
  for (
    let attempt = 1;
    readiness.status !== "ok" && attempt < 30;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    readiness = await checkReadiness(toolboxUrl);
  }
  return readiness;
}

function checkReadiness(toolboxUrl: string) {
  return checkAgentRuntimeReadinessFromEnv(
    {
      AGENT_RUNTIME: "claude",
      AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
      ANTHROPIC_AUTH_TOKEN: "local-readiness-only",
      TOOLBOX_URL: toolboxUrl,
    },
    { timeoutMs: 5_000 },
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
