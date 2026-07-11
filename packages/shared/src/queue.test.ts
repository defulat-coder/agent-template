import { describe, expect, it } from "vitest";
import { createBullMqConnectionOptions } from "./queue.js";

describe("createBullMqConnectionOptions", () => {
  it("parses Redis URLs for BullMQ", () => {
    expect(
      createBullMqConnectionOptions("redis://user:pass@localhost:16379/2"),
    ).toEqual({
      host: "localhost",
      port: 16379,
      username: "user",
      password: "pass",
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it("rejects non-numeric Redis database indexes", () => {
    expect(() =>
      createBullMqConnectionOptions("redis://localhost/not-a-number"),
    ).toThrow("Redis URL database index must be a non-negative integer");
  });
});
