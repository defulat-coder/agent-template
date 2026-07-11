import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  noExternal: ["@agent-template/agent-client", "@agent-template/shared"],
  banner: { js: "#!/usr/bin/env node" },
});
