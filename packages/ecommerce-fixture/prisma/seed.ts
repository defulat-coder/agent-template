import { ecommerceFixturePrisma, ecommerceFixture } from "../src/index.js";

for (const customer of ecommerceFixture.customers) {
  await ecommerceFixturePrisma.ecommerceCustomer.upsert({
    where: { id: customer.id },
    create: customer,
    update: customer,
  });
}

for (const product of ecommerceFixture.products) {
  await ecommerceFixturePrisma.ecommerceProduct.upsert({
    where: { id: product.id },
    create: product,
    update: product,
  });
}

for (const order of ecommerceFixture.orders) {
  await ecommerceFixturePrisma.ecommerceOrder.upsert({
    where: { id: order.id },
    create: order,
    update: order,
  });
}

for (const item of ecommerceFixture.orderItems) {
  await ecommerceFixturePrisma.ecommerceOrderItem.upsert({
    where: { id: item.id },
    create: item,
    update: item,
  });
}

for (const payment of ecommerceFixture.payments) {
  await ecommerceFixturePrisma.ecommercePayment.upsert({
    where: { id: payment.id },
    create: payment,
    update: payment,
  });
}

console.log(
  `Seeded ${ecommerceFixture.customers.length} ecommerce customers, ${ecommerceFixture.products.length} products, ${ecommerceFixture.orders.length} orders, ${ecommerceFixture.orderItems.length} order items, and ${ecommerceFixture.payments.length} payments into ecommerce_fixture.`,
);

await ecommerceFixturePrisma.$disconnect();
