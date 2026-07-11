import { describe, expect, it } from "vitest";
import {
  defaultEcommerceFixtureDatabaseUrl,
  getEcommerceFixtureDatabaseUrl,
} from "./config.js";

describe("getEcommerceFixtureDatabaseUrl", () => {
  it("forces the isolated fixture schema on the configured database", () => {
    expect(
      getEcommerceFixtureDatabaseUrl({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/app?schema=public",
      }),
    ).toBe(
      "postgresql://user:pass@localhost:5432/app?schema=ecommerce_fixture",
    );
  });

  it("uses the local fixture URL by default", () => {
    expect(getEcommerceFixtureDatabaseUrl({})).toBe(
      defaultEcommerceFixtureDatabaseUrl,
    );
  });
});
