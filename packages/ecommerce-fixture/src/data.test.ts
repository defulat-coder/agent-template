import { describe, expect, it } from "vitest";
import { ecommerceFixture } from "./data";

describe("ecommerceFixture", () => {
  it("provides a deterministic, production-shaped retail dataset", () => {
    expect(ecommerceFixture.customers).toHaveLength(96);
    expect(ecommerceFixture.products).toHaveLength(24);
    expect(ecommerceFixture.orders).toHaveLength(600);
    expect(ecommerceFixture.orderItems.length).toBeGreaterThan(1_000);
    expect(
      new Set(ecommerceFixture.orders.map((order) => order.orderNumber)).size,
    ).toBe(600);
    expect(
      new Set(ecommerceFixture.orders.map((order) => order.channel)),
    ).toEqual(new Set(["WEB", "MINI_PROGRAM", "MARKETPLACE", "LIVE_STREAM"]));
    expect(ecommerceFixture.orders[0]?.createdAt.toISOString()).toBe(
      "2026-05-11T01:00:00.000Z",
    );
  });

  it("keeps paid and refund amounts internally consistent", () => {
    for (const order of ecommerceFixture.orders) {
      const paidTotal = Number(order.paidTotal);
      const refundedTotal = Number(order.refundedTotal);

      expect(refundedTotal).toBeLessThanOrEqual(paidTotal);
      if (order.status === "CANCELLED" || order.status === "PENDING")
        expect(paidTotal).toBe(0);
    }

    const refundedOrders = ecommerceFixture.orders.filter(
      (order) => order.status === "REFUNDED",
    );

    expect(
      refundedOrders.some(
        (order) => Number(order.refundedTotal) === Number(order.paidTotal),
      ),
    ).toBe(true);
    expect(
      refundedOrders.some(
        (order) =>
          Number(order.refundedTotal) > 0 &&
          Number(order.refundedTotal) < Number(order.paidTotal),
      ),
    ).toBe(true);
  });
});
