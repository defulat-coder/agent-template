import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  external: [
    "@prisma/adapter-pg",
    "@prisma/client",
    "bullmq",
    "fastify",
    "ioredis",
    "pg",
    "pino",
    "zod",
  ],
  noExternal: [/^@agent-template\//],
  clean: true,
});
