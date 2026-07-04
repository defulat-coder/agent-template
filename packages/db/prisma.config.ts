import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { getDatabaseUrl } from "./src/config.js";

config({ path: "../../.env" });
config({ path: "../../.env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: getDatabaseUrl()
  }
});
