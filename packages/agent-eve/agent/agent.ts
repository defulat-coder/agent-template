import { defineAgent } from "eve";
import { createEveAnthropicModel } from "../src/config";

export default defineAgent({
  model: createEveAnthropicModel(process.env),
  modelContextWindowTokens: 128_000,
  compaction: {
    modelContextWindowTokens: 128_000,
  },
});
