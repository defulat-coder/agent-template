import { defineMcpClientConnection } from "eve/connections";
import { never } from "eve/tools/approval";

const toolboxUrl = `${(process.env.TOOLBOX_URL ?? "http://localhost:15000").replace(/\/$/, "")}/mcp`;

export default defineMcpClientConnection({
  url: toolboxUrl,
  description: "Agent Template read model: template events, Agent runs, and Agent run timelines.",
  approval: never(),
  tools: {
    allow: ["list-template-events", "get-template-event", "list-agent-runs", "list-agent-run-timeline"]
  }
});
