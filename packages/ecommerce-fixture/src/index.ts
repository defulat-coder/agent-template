import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client.js";
import { getEcommerceFixtureDatabaseUrl } from "./config.js";

const globalForFixture = globalThis as unknown as {
  ecommerceFixturePrisma?: PrismaClient;
};

const adapter = new PrismaPg({
  connectionString: getEcommerceFixtureDatabaseUrl(),
});

export const ecommerceFixturePrisma =
  globalForFixture.ecommerceFixturePrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForFixture.ecommerceFixturePrisma = ecommerceFixturePrisma;
}

export { ecommerceFixture } from "./data.js";
export {
  defaultEcommerceFixtureDatabaseUrl,
  getEcommerceFixtureDatabaseUrl,
} from "./config.js";
