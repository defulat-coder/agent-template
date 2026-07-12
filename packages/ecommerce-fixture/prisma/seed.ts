import {
  ecommerceBusinessFixture as fixture,
  ecommerceFixturePrisma,
} from "../src/index.js";

const batchSize = 500;

try {
  await ecommerceFixturePrisma.$transaction(
    async (transaction) => {
      await transaction.marketingAttribution.deleteMany();
      await transaction.logisticsShipmentEvent.deleteMany();
      await transaction.financeRefund.deleteMany();
      await transaction.financeInvoice.deleteMany();
      await transaction.logisticsShipment.deleteMany();
      await transaction.inventorySnapshot.deleteMany();
      await transaction.procurementOrder.deleteMany();
      await transaction.financeSettlement.deleteMany();
      await transaction.marketingCampaign.deleteMany();
      await transaction.procurementSupplier.deleteMany();
      await transaction.inventoryWarehouse.deleteMany();
      await transaction.ecommercePayment.deleteMany();
      await transaction.ecommerceOrderItem.deleteMany();
      await transaction.ecommerceOrder.deleteMany();
      await transaction.ecommerceProduct.deleteMany();
      await transaction.ecommerceCustomer.deleteMany();

      await createManyInBatches(fixture.customers, (data) =>
        transaction.ecommerceCustomer.createMany({ data }),
      );
      await createManyInBatches(fixture.products, (data) =>
        transaction.ecommerceProduct.createMany({ data }),
      );
      await createManyInBatches(fixture.warehouses, (data) =>
        transaction.inventoryWarehouse.createMany({ data }),
      );
      await createManyInBatches(fixture.suppliers, (data) =>
        transaction.procurementSupplier.createMany({ data }),
      );
      await createManyInBatches(fixture.campaigns, (data) =>
        transaction.marketingCampaign.createMany({ data }),
      );
      await createManyInBatches(fixture.orders, (data) =>
        transaction.ecommerceOrder.createMany({ data }),
      );
      await createManyInBatches(fixture.orderItems, (data) =>
        transaction.ecommerceOrderItem.createMany({ data }),
      );
      await createManyInBatches(fixture.payments, (data) =>
        transaction.ecommercePayment.createMany({ data }),
      );
      await createManyInBatches(fixture.inventorySnapshots, (data) =>
        transaction.inventorySnapshot.createMany({ data }),
      );
      await createManyInBatches(fixture.procurementOrders, (data) =>
        transaction.procurementOrder.createMany({ data }),
      );
      await createManyInBatches(fixture.shipments, (data) =>
        transaction.logisticsShipment.createMany({ data }),
      );
      await createManyInBatches(fixture.shipmentEvents, (data) =>
        transaction.logisticsShipmentEvent.createMany({ data }),
      );
      await createManyInBatches(fixture.refunds, (data) =>
        transaction.financeRefund.createMany({ data }),
      );
      await createManyInBatches(fixture.invoices, (data) =>
        transaction.financeInvoice.createMany({ data }),
      );
      await createManyInBatches(fixture.settlements, (data) =>
        transaction.financeSettlement.createMany({ data }),
      );
      await createManyInBatches(fixture.attributions, (data) =>
        transaction.marketingAttribution.createMany({ data }),
      );
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  console.log(
    [
      "Seeded deterministic ecommerce_fixture data:",
      `- commerce: ${fixture.customers.length} customers, ${fixture.products.length} products, ${fixture.orders.length} orders, ${fixture.orderItems.length} order items, ${fixture.payments.length} payments`,
      `- finance: ${fixture.refunds.length} refunds, ${fixture.invoices.length} invoices, ${fixture.settlements.length} settlements`,
      `- inventory: ${fixture.warehouses.length} warehouses, ${fixture.inventorySnapshots.length} daily snapshots`,
      `- logistics: ${fixture.shipments.length} shipments, ${fixture.shipmentEvents.length} shipment events`,
      `- procurement: ${fixture.suppliers.length} suppliers, ${fixture.procurementOrders.length} purchase orders`,
      `- marketing: ${fixture.campaigns.length} campaigns, ${fixture.attributions.length} attributions`,
    ].join("\n"),
  );
} finally {
  await ecommerceFixturePrisma.$disconnect();
}

async function createManyInBatches<Row>(
  rows: Row[],
  createMany: (batch: Row[]) => Promise<unknown>,
) {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    await createMany(rows.slice(offset, offset + batchSize));
  }
}
