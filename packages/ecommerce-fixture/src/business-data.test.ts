import { describe, expect, it } from "vitest";
import { createEcommerceBusinessFixture } from "./business-data.js";
import { ecommerceFixture } from "./data.js";

describe("ecommerceBusinessFixture", () => {
  it("builds the same cross-domain dataset on every run", () => {
    expect(createEcommerceBusinessFixture()).toEqual(
      createEcommerceBusinessFixture(),
    );
  });

  it("fails with relationship identifiers when a settled order loses its customer", () => {
    const order = ecommerceFixture.orders.find((candidate) => candidate.paidAt);
    expect(order).toBeDefined();
    if (!order) throw new Error("Test fixture is missing a settled order");

    expect(() =>
      createEcommerceBusinessFixture({
        ...ecommerceFixture,
        customers: ecommerceFixture.customers.filter(
          (customer) => customer.id !== order.customerId,
        ),
      }),
    ).toThrow(
      `Settled order ${order.id} references missing customer ${order.customerId}`,
    );
  });

  it("covers finance, logistics, inventory, procurement, and marketing", () => {
    const fixture = createEcommerceBusinessFixture();

    expect(fixture.warehouses).toHaveLength(6);
    expect(fixture.inventorySnapshots.length).toBeGreaterThanOrEqual(8_000);
    expect(fixture.suppliers.length).toBeGreaterThanOrEqual(8);
    expect(fixture.procurementOrders).toHaveLength(180);
    expect(fixture.shipments).toHaveLength(480);
    expect(fixture.invoices).toHaveLength(480);
    expect(fixture.settlements).toHaveLength(60 * 4);
    expect(fixture.campaigns).toHaveLength(12);
    expect(fixture.attributions).toHaveLength(688);
  });

  it("keeps every cross-domain foreign key and one-to-one relation stable", () => {
    const fixture = createEcommerceBusinessFixture();
    const orderIds = new Set(fixture.orders.map((order) => order.id));
    const productIds = new Set(fixture.products.map((product) => product.id));
    const warehouseIds = new Set(
      fixture.warehouses.map((warehouse) => warehouse.id),
    );
    const supplierIds = new Set(
      fixture.suppliers.map((supplier) => supplier.id),
    );
    const campaignIds = new Set(
      fixture.campaigns.map((campaign) => campaign.id),
    );

    expect(
      fixture.shipments.every(
        (shipment) =>
          orderIds.has(shipment.orderId) &&
          warehouseIds.has(shipment.warehouseId),
      ),
    ).toBe(true);
    expect(
      fixture.inventorySnapshots.every(
        (snapshot) =>
          productIds.has(snapshot.productId) &&
          warehouseIds.has(snapshot.warehouseId),
      ),
    ).toBe(true);
    expect(
      fixture.procurementOrders.every(
        (order) =>
          supplierIds.has(order.supplierId) &&
          warehouseIds.has(order.warehouseId),
      ),
    ).toBe(true);
    expect(
      fixture.attributions.every(
        (attribution) =>
          orderIds.has(attribution.orderId) &&
          (!attribution.campaignId || campaignIds.has(attribution.campaignId)),
      ),
    ).toBe(true);

    for (const relation of [
      fixture.refunds,
      fixture.invoices,
      fixture.shipments,
    ]) {
      expect(new Set(relation.map((row) => row.orderId)).size).toBe(
        relation.length,
      );
    }

    const attributionsByOrder = Map.groupBy(
      fixture.attributions,
      (attribution) => attribution.orderId,
    );
    const paidOrderIds = fixture.orders
      .filter((order) => order.paidAt)
      .map((order) => order.id);
    expect(new Set(attributionsByOrder.keys())).toEqual(new Set(paidOrderIds));
    expect(
      [...attributionsByOrder.values()].some(
        (attributions) =>
          attributions.length > 1 &&
          new Set(attributions.map((attribution) => attribution.channel)).size >
            1,
      ),
    ).toBe(true);
  });

  it("creates a completed refund for every refunded order", () => {
    const fixture = createEcommerceBusinessFixture();
    const refundedOrders = fixture.orders.filter(
      (order) => order.status === "REFUNDED",
    );

    const completedRefunds = fixture.refunds.filter(
      (refund) => refund.status === "COMPLETED",
    );
    expect(completedRefunds).toHaveLength(refundedOrders.length);
    expect(new Set(completedRefunds.map((refund) => refund.orderId))).toEqual(
      new Set(refundedOrders.map((order) => order.id)),
    );
    expect(
      completedRefunds.every(
        (refund) =>
          refund.status === "COMPLETED" &&
          refund.completedAt !== null &&
          refund.completedAt > refund.requestedAt &&
          Number(refund.amount) > 0,
      ),
    ).toBe(true);
  });

  it("keeps shipment events chronological and makes delivery anomalies explainable", () => {
    const fixture = createEcommerceBusinessFixture();
    const eventsByShipment = Map.groupBy(
      fixture.shipmentEvents,
      (event) => event.shipmentId,
    );

    for (const shipment of fixture.shipments) {
      const events = eventsByShipment.get(shipment.id) ?? [];
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.map((event) => event.eventAt.getTime())).toEqual(
        [...events]
          .sort(
            (left, right) => left.eventAt.getTime() - right.eventAt.getTime(),
          )
          .map((event) => event.eventAt.getTime()),
      );
      if (shipment.status === "DELAYED" || shipment.status === "LOST") {
        expect(events.some((event) => event.type === shipment.status)).toBe(
          true,
        );
      }
    }

    expect(
      fixture.shipments.some((shipment) => shipment.status === "DELAYED"),
    ).toBe(true);
    expect(
      fixture.shipments.some((shipment) => shipment.status === "LOST"),
    ).toBe(true);
  });

  it("contains deterministic anomalies for each operational domain", () => {
    const fixture = createEcommerceBusinessFixture();

    expect(
      fixture.invoices.some(
        (invoice) =>
          invoice.status === "MISMATCH" && Number(invoice.mismatchAmount) !== 0,
      ),
    ).toBe(true);
    expect(
      fixture.settlements.some(
        (settlement) =>
          settlement.status === "DISCREPANCY" &&
          Number(settlement.differenceAmount) !== 0,
      ),
    ).toBe(true);
    expect(
      fixture.inventorySnapshots.some(
        (snapshot) =>
          snapshot.riskLevel === "STOCKOUT" && snapshot.onHand === 0,
      ),
    ).toBe(true);
    expect(
      fixture.procurementOrders.some(
        (order) => order.status === "DELAYED" && order.delayedDays > 0,
      ),
    ).toBe(true);

    const underperformingCampaign = fixture.campaigns.find(
      (campaign) => campaign.campaignCode === "CMP-012",
    );
    const attributedRevenue = fixture.attributions
      .filter(
        (attribution) => attribution.campaignId === underperformingCampaign?.id,
      )
      .reduce(
        (total, attribution) => total + Number(attribution.attributedRevenue),
        0,
      );
    expect(underperformingCampaign).toBeDefined();
    expect(attributedRevenue).toBeLessThan(
      Number(underperformingCampaign?.spend),
    );
  });

  it("covers in-flight and terminal production workflow states", () => {
    const fixture = createEcommerceBusinessFixture();

    expect(new Set(fixture.refunds.map((refund) => refund.status))).toEqual(
      new Set(["REQUESTED", "PROCESSING", "COMPLETED", "REJECTED"]),
    );
    expect(
      new Set(fixture.settlements.map((settlement) => settlement.status)),
    ).toEqual(new Set(["PENDING", "SETTLED", "DISCREPANCY"]));
    expect(
      new Set(fixture.procurementOrders.map((order) => order.status)),
    ).toEqual(
      new Set(["ORDERED", "IN_TRANSIT", "RECEIVED", "DELAYED", "CANCELLED"]),
    );
  });

  it("reconciles finance and marketing amounts exactly to cents", () => {
    const fixture = createEcommerceBusinessFixture();

    for (const settlement of fixture.settlements) {
      expect(toCents(settlement.expectedAmount)).toBe(
        toCents(settlement.grossAmount) -
          toCents(settlement.refundAmount) -
          toCents(settlement.feeAmount),
      );
      if (settlement.status === "PENDING") {
        expect(settlement.settledAmount).toBeNull();
        expect(settlement.differenceAmount).toBeNull();
        expect(settlement.settledAt).toBeNull();
        continue;
      }
      if (
        settlement.settledAmount === null ||
        settlement.differenceAmount === null ||
        settlement.settledAt === null
      ) {
        throw new Error(
          `Completed settlement ${settlement.settlementNumber} is missing actual values`,
        );
      }
      expect(toCents(settlement.differenceAmount)).toBe(
        toCents(settlement.settledAmount) - toCents(settlement.expectedAmount),
      );
    }

    for (const campaign of fixture.campaigns) {
      const campaignAttributions = fixture.attributions.filter(
        (attribution) => attribution.campaignId === campaign.id,
      );
      const allocatedSpend = campaignAttributions.reduce(
        (total, attribution) => total + toCents(attribution.allocatedSpend),
        0,
      );
      expect(allocatedSpend).toBe(toCents(campaign.spend));
      expect(
        campaignAttributions.every(
          (attribution) =>
            attribution.touchpointAt >= campaign.startAt &&
            attribution.touchpointAt < campaign.endAt,
        ),
      ).toBe(true);
    }

    const attributionsByOrder = Map.groupBy(
      fixture.attributions,
      (attribution) => attribution.orderId,
    );
    for (const order of fixture.orders.filter((order) => order.paidAt)) {
      expect(
        (attributionsByOrder.get(order.id) ?? []).reduce(
          (total, attribution) =>
            total + toCents(attribution.attributedRevenue),
          0,
        ),
      ).toBe(toCents(order.paidTotal) - toCents(order.refundedTotal));
    }
  });

  it("keeps inventory snapshots unique and quantities physically valid", () => {
    const fixture = createEcommerceBusinessFixture();
    const snapshotKeys = fixture.inventorySnapshots.map(
      (snapshot) =>
        `${snapshot.warehouseId}:${snapshot.productId}:${snapshot.snapshotDate.toISOString()}`,
    );

    expect(new Set(snapshotKeys).size).toBe(snapshotKeys.length);
    expect(
      fixture.inventorySnapshots.every(
        (snapshot) =>
          snapshot.onHand >= 0 &&
          snapshot.reserved >= 0 &&
          snapshot.reserved <= snapshot.onHand &&
          snapshot.inTransit >= 0 &&
          snapshot.safetyStock >= 0,
      ),
    ).toBe(true);
  });
});

function toCents(value: string) {
  return Math.round(Number(value) * 100);
}
