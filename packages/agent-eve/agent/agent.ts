import { defineAgent, type AgentDefinition } from "eve";
import { createEveAnthropicModel } from "../src/config";

const agent: AgentDefinition = defineAgent({
  model: createEveAnthropicModel(process.env),
  modelContextWindowTokens: 128_000,
  compaction: {
    modelContextWindowTokens: 128_000
  }
});

export default agent;
