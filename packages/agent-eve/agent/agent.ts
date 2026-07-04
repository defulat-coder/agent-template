import { defineAgent } from "eve";
import { readEveAgentModel } from "../src/config";

export default defineAgent({
  model: readEveAgentModel(process.env)
});
