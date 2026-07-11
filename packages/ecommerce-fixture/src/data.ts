export type EcommerceOrderStatusFixture =
  | "PENDING"
  | "PAID"
  | "FULFILLED"
  | "CANCELLED"
  | "REFUNDED";

export type EcommercePaymentStatusFixture =
  | "PENDING"
  | "SUCCEEDED"
  | "REFUNDED";

export type EcommerceFixture = {
  customers: Array<{
    id: string;
    customerCode: string;
    segment: "NEW" | "ACTIVE" | "VIP" | "AT_RISK";
    region: string;
    province: string;
    city: string;
    registeredAt: Date;
  }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    brand: string;
    unitPrice: string;
    isActive: boolean;
    createdAt: Date;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    customerId: string;
    channel: "WEB" | "MINI_PROGRAM" | "MARKETPLACE" | "LIVE_STREAM";
    status: EcommerceOrderStatusFixture;
    placedAt: Date;
    paidAt: Date | null;
    fulfilledAt: Date | null;
    subtotal: string;
    discountTotal: string;
    shippingTotal: string;
    paidTotal: string;
    refundedTotal: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  orderItems: Array<{
    id: string;
    orderId: string;
    productId: string;
    sku: string;
    productName: string;
    category: string;
    unitPrice: string;
    quantity: number;
    discountTotal: string;
    lineTotal: string;
  }>;
  payments: Array<{
    id: string;
    orderId: string;
    method: "ALIPAY" | "WECHAT_PAY" | "BANK_CARD" | "WALLET";
    status: EcommercePaymentStatusFixture;
    amount: string;
    paidAt: Date | null;
    createdAt: Date;
  }>;
};

const customersPerRegion = 12;
const orderDays = 60;
const ordersPerDay = 10;
const money = (amount: number) => (Math.round(amount * 100) / 100).toFixed(2);

const locations = [
  { city: "上海", province: "上海", region: "华东" },
  { city: "杭州", province: "浙江", region: "华东" },
  { city: "北京", province: "北京", region: "华北" },
  { city: "广州", province: "广东", region: "华南" },
  { city: "深圳", province: "广东", region: "华南" },
  { city: "成都", province: "四川", region: "西南" },
  { city: "武汉", province: "湖北", region: "华中" },
  { city: "西安", province: "陕西", region: "西北" },
] as const;

const productCatalog = [
  ["ELEC-001", "降噪蓝牙耳机", "智能设备", "澄光", 299],
  ["ELEC-002", "智能运动手环", "智能设备", "澄光", 199],
  ["ELEC-003", "便携蓝牙音箱", "智能设备", "澄光", 239],
  ["ELEC-004", "氮化镓快充套装", "智能设备", "澄光", 159],
  ["HOME-001", "人体工学坐垫", "居家生活", "栖居", 189],
  ["HOME-002", "真空保温随行杯", "居家生活", "栖居", 99],
  ["HOME-003", "香薰扩香礼盒", "居家生活", "栖居", 149],
  ["HOME-004", "高支纯棉床品套件", "居家生活", "栖居", 399],
  ["SPORT-001", "轻量跑步鞋", "户外运动", "逐风", 459],
  ["SPORT-002", "折叠瑜伽垫", "户外运动", "逐风", 129],
  ["SPORT-003", "城市通勤双肩包", "户外运动", "逐风", 269],
  ["SPORT-004", "防晒运动外套", "户外运动", "逐风", 329],
  ["BEAUTY-001", "氨基酸洁面套装", "美妆个护", "初见", 139],
  ["BEAUTY-002", "修护精华液", "美妆个护", "初见", 329],
  ["BEAUTY-003", "防晒隔离乳", "美妆个护", "初见", 169],
  ["BEAUTY-004", "植萃洗护礼盒", "美妆个护", "初见", 219],
  ["BABY-001", "婴童防晒帽", "母婴用品", "芽芽", 79],
  ["BABY-002", "吸管保温水杯", "母婴用品", "芽芽", 119],
  ["BABY-003", "亲子出行收纳包", "母婴用品", "芽芽", 149],
  ["BABY-004", "婴童感统积木", "母婴用品", "芽芽", 259],
  ["FOOD-001", "精品挂耳咖啡", "食品饮料", "寻味", 69],
  ["FOOD-002", "低糖坚果礼盒", "食品饮料", "寻味", 129],
  ["FOOD-003", "冷萃茶饮组合", "食品饮料", "寻味", 89],
  ["FOOD-004", "早餐谷物组合", "食品饮料", "寻味", 109],
] as const;

const orderStatusCycle: EcommerceOrderStatusFixture[] = [
  "FULFILLED",
  "FULFILLED",
  "FULFILLED",
  "PAID",
  "PAID",
  "PAID",
  "REFUNDED",
  "REFUNDED",
  "CANCELLED",
  "PENDING",
];

export function createEcommerceFixture(): EcommerceFixture {
  const customers = locations.flatMap((location, locationIndex) =>
    Array.from({ length: customersPerRegion }, (_, customerIndex) => {
      const ordinal = locationIndex * customersPerRegion + customerIndex + 1;
      const segment = (["NEW", "ACTIVE", "VIP", "AT_RISK"] as const)[
        ordinal % 4
      ]!;

      return {
        id: `ecom_customer_${String(ordinal).padStart(3, "0")}`,
        customerCode: `CUST-${String(ordinal).padStart(4, "0")}`,
        segment,
        ...location,
        registeredAt: new Date(
          Date.UTC(2025, ordinal % 12, (ordinal % 27) + 1),
        ),
      };
    }),
  );
  const products = productCatalog.map(
    ([sku, name, category, brand, unitPrice], index) => ({
      id: `ecom_product_${String(index + 1).padStart(3, "0")}`,
      sku,
      name,
      category,
      brand,
      unitPrice: money(unitPrice),
      isActive: true,
      createdAt: new Date(Date.UTC(2025, index % 12, (index % 27) + 1)),
    }),
  );
  const orders: EcommerceFixture["orders"] = [];
  const orderItems: EcommerceFixture["orderItems"] = [];
  const payments: EcommerceFixture["payments"] = [];

  for (let day = 0; day < orderDays; day += 1) {
    for (let sequence = 0; sequence < ordersPerDay; sequence += 1) {
      const ordinal = day * ordersPerDay + sequence;
      const placedAt = new Date(
        Date.UTC(2026, 4, 11 + day, 1 + (sequence % 10), sequence * 5),
      );
      const orderId = `ecom_order_${String(ordinal + 1).padStart(4, "0")}`;
      const orderNumber = `EC${placedAt.toISOString().slice(0, 10).replaceAll("-", "")}${String(sequence + 1).padStart(3, "0")}`;
      const customer = customers[(ordinal * 7) % customers.length]!;
      const status = orderStatusCycle[sequence]!;
      const itemCount = 1 + ((day + sequence) % 3);
      let subtotal = 0;
      let discountTotal = 0;

      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        const product =
          products[(ordinal * 3 + itemIndex * 5) % products.length]!;
        const quantity = 1 + ((ordinal + itemIndex) % 2);
        const gross = Number(product.unitPrice) * quantity;
        const itemDiscount = (ordinal + itemIndex) % 5 === 0 ? gross * 0.1 : 0;

        subtotal += gross;
        discountTotal += itemDiscount;
        orderItems.push({
          id: `${orderId}_item_${itemIndex + 1}`,
          orderId,
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          category: product.category,
          unitPrice: product.unitPrice,
          quantity,
          discountTotal: money(itemDiscount),
          lineTotal: money(gross - itemDiscount),
        });
      }

      const shippingTotal = subtotal - discountTotal >= 199 ? 0 : 12;
      const orderTotal = subtotal - discountTotal + shippingTotal;
      const isPaid =
        status === "PAID" || status === "FULFILLED" || status === "REFUNDED";
      const paidAt = isPaid
        ? new Date(placedAt.getTime() + 8 * 60 * 1000)
        : null;
      const fulfilledAt =
        status === "FULFILLED"
          ? new Date(placedAt.getTime() + 28 * 60 * 60 * 1000)
          : null;
      const refundRatio =
        status === "REFUNDED" ? (sequence % 2 === 0 ? 1 : 0.4) : 0;

      orders.push({
        id: orderId,
        orderNumber,
        customerId: customer.id,
        channel: (
          ["WEB", "MINI_PROGRAM", "MARKETPLACE", "LIVE_STREAM"] as const
        )[(day + sequence) % 4]!,
        status,
        placedAt,
        paidAt,
        fulfilledAt,
        subtotal: money(subtotal),
        discountTotal: money(discountTotal),
        shippingTotal: money(shippingTotal),
        paidTotal: money(isPaid ? orderTotal : 0),
        refundedTotal: money(orderTotal * refundRatio),
        createdAt: placedAt,
        updatedAt: fulfilledAt ?? paidAt ?? placedAt,
      });

      if (status !== "CANCELLED") {
        payments.push({
          id: `${orderId}_payment`,
          orderId,
          method: (["ALIPAY", "WECHAT_PAY", "BANK_CARD", "WALLET"] as const)[
            ordinal % 4
          ]!,
          status:
            status === "PENDING"
              ? "PENDING"
              : status === "REFUNDED"
                ? "REFUNDED"
                : "SUCCEEDED",
          amount: money(isPaid ? orderTotal : 0),
          paidAt,
          createdAt: paidAt ?? placedAt,
        });
      }
    }
  }

  return { customers, products, orders, orderItems, payments };
}

export const ecommerceFixture = createEcommerceFixture();
