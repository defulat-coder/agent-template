import { ecommerceFixture, type EcommerceFixture } from "./data.js";

const dayMs = 24 * 60 * 60 * 1_000;
const hourMs = 60 * 60 * 1_000;
const fixtureStart = new Date(Date.UTC(2026, 4, 11));
const fixtureDays = 60;
const channels = ["WEB", "MINI_PROGRAM", "MARKETPLACE", "LIVE_STREAM"] as const;

type SalesChannel = (typeof channels)[number];
type RefundReason =
  | "CUSTOMER_REQUEST"
  | "DAMAGED_ITEM"
  | "DELIVERY_DELAY"
  | "LOST_SHIPMENT"
  | "QUALITY_ISSUE"
  | "PRICE_ADJUSTMENT";
type ShipmentStatus =
  | "IN_TRANSIT"
  | "DELAYED"
  | "DELIVERED"
  | "LOST"
  | "RETURNED";
type ShipmentEventType =
  | "CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELAYED"
  | "DELIVERED"
  | "LOST"
  | "RETURNED";

export type EcommerceBusinessFixture = EcommerceFixture & {
  refunds: Array<{
    id: string;
    orderId: string;
    reason: RefundReason;
    status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "REJECTED";
    requestedAt: Date;
    completedAt: Date | null;
    amount: string;
    processingHours: number;
  }>;
  invoices: Array<{
    id: string;
    orderId: string;
    invoiceNumber: string;
    status: "ISSUED" | "PAID" | "VOID" | "MISMATCH";
    amount: string;
    mismatchAmount: string;
    issuedAt: Date;
    dueAt: Date;
  }>;
  settlements: Array<{
    id: string;
    settlementNumber: string;
    channel: SalesChannel;
    periodStart: Date;
    periodEnd: Date;
    grossAmount: string;
    refundAmount: string;
    feeAmount: string;
    expectedAmount: string;
    settledAmount: string | null;
    differenceAmount: string | null;
    status: "PENDING" | "SETTLED" | "DISCREPANCY";
    settledAt: Date | null;
  }>;
  warehouses: Array<{
    id: string;
    warehouseCode: string;
    name: string;
    region: string;
    city: string;
    capacityUnits: number;
  }>;
  inventorySnapshots: Array<{
    id: string;
    warehouseId: string;
    productId: string;
    snapshotDate: Date;
    onHand: number;
    reserved: number;
    inTransit: number;
    safetyStock: number;
    unitCost: string;
    riskLevel: "HEALTHY" | "LOW" | "STOCKOUT" | "OVERSTOCK";
  }>;
  shipments: Array<{
    id: string;
    shipmentNumber: string;
    orderId: string;
    warehouseId: string;
    carrier: "SF_EXPRESS" | "JD_LOGISTICS" | "YTO_EXPRESS" | "ZTO_EXPRESS";
    status: ShipmentStatus;
    shippedAt: Date;
    promisedAt: Date;
    deliveredAt: Date | null;
    freightCost: string;
    distanceKm: number;
  }>;
  shipmentEvents: Array<{
    id: string;
    shipmentId: string;
    type: ShipmentEventType;
    eventAt: Date;
    location: string;
    detail: string;
  }>;
  suppliers: Array<{
    id: string;
    supplierCode: string;
    name: string;
    category: string;
    region: string;
    rating: string;
    leadTimeDays: number;
    onTimeRate: string;
  }>;
  procurementOrders: Array<{
    id: string;
    purchaseOrderNumber: string;
    supplierId: string;
    warehouseId: string;
    status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "DELAYED" | "CANCELLED";
    orderedAt: Date;
    expectedAt: Date;
    receivedAt: Date | null;
    amount: string;
    skuCount: number;
    delayedDays: number;
  }>;
  campaigns: Array<{
    id: string;
    campaignCode: string;
    name: string;
    channel: SalesChannel;
    objective: "ACQUISITION" | "CONVERSION" | "RETENTION" | "REACTIVATION";
    startAt: Date;
    endAt: Date;
    budget: string;
    spend: string;
    couponCode: string | null;
  }>;
  attributions: Array<{
    id: string;
    orderId: string;
    campaignId: string;
    channel: SalesChannel;
    couponCode: string | null;
    attributedRevenue: string;
    allocatedSpend: string;
    isNewCustomer: boolean;
    touchpointAt: Date;
  }>;
};

const warehouseCatalog: EcommerceBusinessFixture["warehouses"] = [
  {
    id: "inventory_warehouse_east_01",
    warehouseCode: "WH-EAST-01",
    name: "华东一号合成仓",
    region: "华东",
    city: "上海",
    capacityUnits: 120_000,
  },
  {
    id: "inventory_warehouse_east_02",
    warehouseCode: "WH-EAST-02",
    name: "华东二号合成仓",
    region: "华东",
    city: "杭州",
    capacityUnits: 100_000,
  },
  {
    id: "inventory_warehouse_north_01",
    warehouseCode: "WH-NORTH-01",
    name: "华北合成仓",
    region: "华北",
    city: "北京",
    capacityUnits: 90_000,
  },
  {
    id: "inventory_warehouse_south_01",
    warehouseCode: "WH-SOUTH-01",
    name: "华南合成仓",
    region: "华南",
    city: "广州",
    capacityUnits: 100_000,
  },
  {
    id: "inventory_warehouse_central_01",
    warehouseCode: "WH-CENTRAL-01",
    name: "华中合成仓",
    region: "华中",
    city: "武汉",
    capacityUnits: 80_000,
  },
  {
    id: "inventory_warehouse_west_01",
    warehouseCode: "WH-WEST-01",
    name: "西部合成仓",
    region: "西部",
    city: "成都",
    capacityUnits: 80_000,
  },
];

const supplierCategories = [
  "智能设备",
  "居家生活",
  "户外运动",
  "美妆个护",
  "母婴用品",
  "食品饮料",
] as const;
const supplierRegions = ["华东", "华南", "华北", "华中"] as const;

export function createEcommerceBusinessFixture(
  base: EcommerceFixture = ecommerceFixture,
): EcommerceBusinessFixture {
  const warehouses = warehouseCatalog.map((warehouse) => ({ ...warehouse }));
  const customersById = new Map(
    base.customers.map((customer) => [customer.id, customer]),
  );
  const suppliers = createSuppliers();
  const procurementOrders = createProcurementOrders(suppliers, warehouses);
  const inventorySnapshots = createInventorySnapshots(base, warehouses);
  const { shipments, shipmentEvents } = createShipments(
    base,
    warehouses,
    customersById,
  );
  const refunds = createRefunds(base, shipments, shipmentEvents);
  const invoices = createInvoices(base);
  const settlements = createSettlements(base);
  const campaigns = createCampaigns();
  const attributions = createAttributions(base, campaigns, customersById);

  return {
    ...base,
    attributions,
    campaigns,
    inventorySnapshots,
    invoices,
    procurementOrders,
    refunds,
    settlements,
    shipmentEvents,
    shipments,
    suppliers,
    warehouses,
  };
}

function createSuppliers(): EcommerceBusinessFixture["suppliers"] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `procurement_supplier_${pad(index + 1, 2)}`,
    supplierCode: `SUP-${pad(index + 1, 3)}`,
    name: `合成供应商${toChineseOrdinal(index + 1)}`,
    category: supplierCategories[index % supplierCategories.length]!,
    region: supplierRegions[index % supplierRegions.length]!,
    rating: ((420 + (index % 7) * 11) / 100).toFixed(2),
    leadTimeDays: 3 + (index % 6),
    onTimeRate: ((8800 + (index % 6) * 180) / 10_000).toFixed(4),
  }));
}

function createProcurementOrders(
  suppliers: EcommerceBusinessFixture["suppliers"],
  warehouses: EcommerceBusinessFixture["warehouses"],
): EcommerceBusinessFixture["procurementOrders"] {
  return Array.from({ length: fixtureDays * 3 }, (_, index) => {
    const day = Math.floor(index / 3);
    const supplier = suppliers[(index * 5 + day) % suppliers.length]!;
    const warehouse = warehouses[(index * 7 + day) % warehouses.length]!;
    const orderedAt = addHours(addDays(fixtureStart, day), 6 + (index % 8));
    const expectedAt = addDays(orderedAt, supplier.leadTimeDays);
    const isCancelled = index % 31 === 0;
    const isDelayed = !isCancelled && index % 17 === 0;
    const isInTransit = !isCancelled && !isDelayed && index % 11 === 0;
    const isOrdered =
      !isCancelled && !isDelayed && !isInTransit && index % 23 === 0;
    const delayedDays = isCancelled
      ? 0
      : isDelayed
        ? 3 + (index % 8)
        : index % 19 === 0
          ? 1
          : 0;
    const status = isCancelled
      ? "CANCELLED"
      : isDelayed
        ? "DELAYED"
        : isInTransit
          ? "IN_TRANSIT"
          : isOrdered
            ? "ORDERED"
            : "RECEIVED";
    const receivedAt =
      status === "RECEIVED" ? addDays(expectedAt, delayedDays) : null;

    return {
      id: `procurement_order_${pad(index + 1, 4)}`,
      purchaseOrderNumber: `PO${dateKey(orderedAt)}${pad((index % 3) + 1, 2)}`,
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      status,
      orderedAt,
      expectedAt,
      receivedAt,
      amount: moneyFromCents(350_000 + ((index * 73_119) % 4_500_000)),
      skuCount: 3 + (index % 18),
      delayedDays,
    };
  });
}

function createInventorySnapshots(
  base: EcommerceFixture,
  warehouses: EcommerceBusinessFixture["warehouses"],
): EcommerceBusinessFixture["inventorySnapshots"] {
  return warehouses.flatMap((warehouse, warehouseIndex) =>
    base.products.flatMap((product, productIndex) =>
      Array.from({ length: fixtureDays }, (_, day) => {
        const signal = warehouseIndex * 10_007 + productIndex * 101 + day;
        const safetyStock = 18 + ((warehouseIndex + productIndex) % 15);
        let onHand = 55 + ((signal * 17) % 220);
        let reserved = (signal * 7) % 36;
        let riskLevel: "HEALTHY" | "LOW" | "STOCKOUT" | "OVERSTOCK" = "HEALTHY";

        if (signal % 113 === 0) {
          onHand = 0;
          reserved = 0;
          riskLevel = "STOCKOUT";
        } else if (signal % 31 === 0) {
          onHand = safetyStock + 3;
          reserved = 5;
          riskLevel = "LOW";
        } else if (signal % 47 === 0) {
          onHand = 460 + (signal % 80);
          riskLevel = "OVERSTOCK";
        } else if (onHand - reserved <= safetyStock) {
          riskLevel = "LOW";
        }

        const snapshotDate = addDays(fixtureStart, day);
        return {
          id: `inventory_snapshot_${warehouse.warehouseCode.toLowerCase()}_${product.sku.toLowerCase()}_${dateKey(snapshotDate)}`,
          warehouseId: warehouse.id,
          productId: product.id,
          snapshotDate,
          onHand,
          reserved,
          inTransit: (signal * 11) % 90,
          safetyStock,
          unitCost: moneyFromCents(
            Math.round(
              toCents(product.unitPrice) * (0.52 + (productIndex % 5) * 0.04),
            ),
          ),
          riskLevel,
        };
      }),
    ),
  );
}

function createShipments(
  base: EcommerceFixture,
  warehouses: EcommerceBusinessFixture["warehouses"],
  customersById: Map<string, EcommerceFixture["customers"][number]>,
) {
  const shipments: EcommerceBusinessFixture["shipments"] = [];
  const shipmentEvents: EcommerceBusinessFixture["shipmentEvents"] = [];
  const settledOrders = base.orders.filter(
    (order) =>
      order.status === "PAID" ||
      order.status === "FULFILLED" ||
      order.status === "REFUNDED",
  );
  const carriers = [
    "SF_EXPRESS",
    "JD_LOGISTICS",
    "YTO_EXPRESS",
    "ZTO_EXPRESS",
  ] as const;

  for (const [index, order] of settledOrders.entries()) {
    const customer = customersById.get(order.customerId);
    if (!customer) {
      throw new Error(
        `Settled order ${order.id} references missing customer ${order.customerId}`,
      );
    }
    if (!order.paidAt) {
      throw new Error(`Settled order ${order.id} is missing paidAt`);
    }
    const warehouse = selectWarehouse(customer.region, index, warehouses);
    const shippedAt = addHours(order.paidAt, 3);
    const promisedAt = addHours(shippedAt, 48 + (index % 3) * 12);
    const status = resolveShipmentStatus(order.status, index);
    const deliveredAt =
      status === "DELIVERED"
        ? (order.fulfilledAt ?? addHours(shippedAt, 30))
        : status === "RETURNED"
          ? addHours(shippedAt, 34 + (index % 8))
          : null;
    const shipmentId = `logistics_shipment_${order.id}`;
    const shipment = {
      id: shipmentId,
      shipmentNumber: `SHP-${dateKey(shippedAt)}-${pad(index + 1, 4)}`,
      orderId: order.id,
      warehouseId: warehouse.id,
      carrier: carriers[index % carriers.length]!,
      status,
      shippedAt,
      promisedAt,
      deliveredAt,
      freightCost: moneyFromCents(900 + ((index * 137) % 3_600)),
      distanceKm: 80 + ((index * 97) % 2_400),
    } satisfies EcommerceBusinessFixture["shipments"][number];
    shipments.push(shipment);

    const events: Array<{
      type: ShipmentEventType;
      eventAt: Date;
      location: string;
      detail: string;
    }> = [
      {
        type: "CREATED",
        eventAt: addHours(shippedAt, -1),
        location: warehouse.city,
        detail: "系统创建合成运单并分配出库仓。",
      },
      {
        type: "PICKED_UP",
        eventAt: shippedAt,
        location: warehouse.city,
        detail: "承运商完成揽收。",
      },
      {
        type: "IN_TRANSIT",
        eventAt: addHours(shippedAt, 6),
        location: `${warehouse.region}合成转运中心`,
        detail: "包裹进入干线运输。",
      },
    ];

    if (status === "DELIVERED" && deliveredAt) {
      events.push({
        type: "DELIVERED",
        eventAt: deliveredAt,
        location: customer.city,
        detail: "包裹按承诺时效内签收。",
      });
    } else if (status === "RETURNED" && deliveredAt) {
      events.push(
        {
          type: "DELIVERED",
          eventAt: deliveredAt,
          location: customer.city,
          detail: "包裹完成首次签收。",
        },
        {
          type: "RETURNED",
          eventAt: addHours(deliveredAt, 48),
          location: warehouse.city,
          detail: "客户退货已返回出库仓。",
        },
      );
    } else if (status === "DELAYED") {
      events.push({
        type: "DELAYED",
        eventAt: addHours(promisedAt, 1),
        location: `${customer.region}合成转运中心`,
        detail: "区域运力不足导致预计送达时间延迟。",
      });
    } else if (status === "LOST") {
      events.push({
        type: "LOST",
        eventAt: addHours(promisedAt, 6),
        location: `${customer.region}合成转运中心`,
        detail: "转运盘点未找到包裹，已登记丢件。",
      });
    }

    events
      .sort((left, right) => left.eventAt.getTime() - right.eventAt.getTime())
      .forEach((event, eventIndex) => {
        shipmentEvents.push({
          id: `${shipmentId}_event_${pad(eventIndex + 1, 2)}`,
          shipmentId,
          ...event,
        });
      });
  }

  return { shipments, shipmentEvents };
}

function createRefunds(
  base: EcommerceFixture,
  shipments: EcommerceBusinessFixture["shipments"],
  shipmentEvents: EcommerceBusinessFixture["shipmentEvents"],
): EcommerceBusinessFixture["refunds"] {
  const shipmentsByOrder = new Map(
    shipments.map((shipment) => [shipment.orderId, shipment]),
  );
  const finalEventByShipment = new Map<string, Date>();
  for (const event of shipmentEvents) {
    const current = finalEventByShipment.get(event.shipmentId);
    if (!current || event.eventAt > current) {
      finalEventByShipment.set(event.shipmentId, event.eventAt);
    }
  }

  const refunds: EcommerceBusinessFixture["refunds"] = [];
  const nonCompletedStatuses = ["REQUESTED", "PROCESSING", "REJECTED"] as const;
  const settledOrders = base.orders.filter((order) => order.paidAt);
  let nonCompletedOrdinal = 0;

  for (const [index, order] of settledOrders.entries()) {
    const isCompletedRefund = order.status === "REFUNDED";
    if (!isCompletedRefund && index % 29 !== 0) continue;

    const shipment = shipmentsByOrder.get(order.id);
    if (!shipment) {
      throw new Error(
        `Refund candidate order ${order.id} is missing its logistics shipment`,
      );
    }
    if (!order.paidAt) {
      throw new Error(`Refund candidate order ${order.id} is missing paidAt`);
    }
    const finalShipmentEventAt = finalEventByShipment.get(shipment.id);
    if (!finalShipmentEventAt) {
      throw new Error(
        `Refund candidate order ${order.id} shipment ${shipment.id} has no logistics events`,
      );
    }

    const status = isCompletedRefund
      ? ("COMPLETED" as const)
      : nonCompletedStatuses[
          nonCompletedOrdinal++ % nonCompletedStatuses.length
        ]!;
    const processingHours =
      status === "COMPLETED"
        ? 6 + (index % 5) * 6
        : status === "PROCESSING"
          ? 12
          : status === "REJECTED"
            ? 8
            : 0;
    const requestedAt = addHours(finalShipmentEventAt, 2);
    refunds.push({
      id: `finance_refund_${order.id}`,
      orderId: order.id,
      reason: resolveRefundReason(shipment.status, index),
      status,
      requestedAt,
      completedAt:
        status === "COMPLETED" ? addHours(requestedAt, processingHours) : null,
      amount: isCompletedRefund
        ? order.refundedTotal
        : moneyFromCents(
            Math.max(100, Math.round(toCents(order.paidTotal) / 4)),
          ),
      processingHours,
    });
  }

  return refunds;
}

function createInvoices(
  base: EcommerceFixture,
): EcommerceBusinessFixture["invoices"] {
  return base.orders
    .filter((order) => order.paidAt)
    .map((order, index) => {
      const isMismatch = index % 41 === 0;
      const issuedAt = addHours(order.paidAt!, 0.25);
      const mismatchCents = isMismatch
        ? (index % 2 === 0 ? 1 : -1) * (350 + (index % 6) * 125)
        : 0;
      return {
        id: `finance_invoice_${order.id}`,
        orderId: order.id,
        invoiceNumber: `INV-${dateKey(issuedAt)}-${pad(index + 1, 4)}`,
        status: isMismatch
          ? ("MISMATCH" as const)
          : order.status === "REFUNDED"
            ? ("VOID" as const)
            : order.status === "FULFILLED"
              ? ("PAID" as const)
              : ("ISSUED" as const),
        amount: order.paidTotal,
        mismatchAmount: moneyFromCents(mismatchCents),
        issuedAt,
        dueAt: addDays(issuedAt, 30),
      };
    });
}

function createSettlements(
  base: EcommerceFixture,
): EcommerceBusinessFixture["settlements"] {
  const feeBasisPoints: Record<SalesChannel, number> = {
    WEB: 60,
    MINI_PROGRAM: 80,
    MARKETPLACE: 120,
    LIVE_STREAM: 200,
  };
  const settledOrders = base.orders.filter((order) => order.paidAt);

  return Array.from({ length: fixtureDays }).flatMap((_, day) =>
    channels.map((channel, channelIndex) => {
      const periodStart = addDays(fixtureStart, day);
      const periodEnd = addDays(periodStart, 1);
      const orders = settledOrders.filter(
        (order) =>
          order.channel === channel &&
          order.paidAt! >= periodStart &&
          order.paidAt! < periodEnd,
      );
      const grossCents = orders.reduce(
        (sum, order) => sum + toCents(order.paidTotal),
        0,
      );
      const refundCents = orders.reduce(
        (sum, order) => sum + toCents(order.refundedTotal),
        0,
      );
      const feeCents = Math.round(
        (grossCents * feeBasisPoints[channel]) / 10_000,
      );
      const expectedCents = grossCents - refundCents - feeCents;
      const ordinal = day * channels.length + channelIndex;
      const isPending = ordinal % 43 === 0;
      const differenceCents =
        !isPending && ordinal % 37 === 0 ? (ordinal % 2 === 0 ? 500 : -350) : 0;
      const settledCents = isPending ? null : expectedCents + differenceCents;
      const status = isPending
        ? "PENDING"
        : differenceCents === 0
          ? "SETTLED"
          : "DISCREPANCY";

      return {
        id: `finance_settlement_${dateKey(periodStart)}_${channel.toLowerCase()}`,
        settlementNumber: `SET-${dateKey(periodStart)}-${channel}`,
        channel,
        periodStart,
        periodEnd,
        grossAmount: moneyFromCents(grossCents),
        refundAmount: moneyFromCents(refundCents),
        feeAmount: moneyFromCents(feeCents),
        expectedAmount: moneyFromCents(expectedCents),
        settledAmount:
          settledCents === null ? null : moneyFromCents(settledCents),
        differenceAmount: isPending ? null : moneyFromCents(differenceCents),
        status,
        settledAt: isPending ? null : addHours(periodEnd, 12),
      };
    }),
  );
}

function createCampaigns(): EcommerceBusinessFixture["campaigns"] {
  const objectives = [
    "ACQUISITION",
    "CONVERSION",
    "RETENTION",
    "REACTIVATION",
  ] as const;
  return Array.from({ length: 3 }).flatMap((_, period) =>
    channels.map((channel, channelIndex) => {
      const ordinal = period * channels.length + channelIndex;
      const isUnderperforming = ordinal === 11;
      const startAt = addDays(fixtureStart, period * 20);
      const endAt = addDays(startAt, 20);
      return {
        id: `marketing_campaign_${pad(ordinal + 1, 2)}`,
        campaignCode: `CMP-${pad(ordinal + 1, 3)}`,
        name: `${channel}第${period + 1}期合成营销活动`,
        channel,
        objective: objectives[(ordinal + period) % objectives.length]!,
        startAt,
        endAt,
        budget: moneyFromCents(
          isUnderperforming ? 20_000_000 : 1_200_000 + ordinal * 85_000,
        ),
        spend: moneyFromCents(
          isUnderperforming ? 18_000_000 : 780_000 + ordinal * 53_000,
        ),
        couponCode: ordinal % 2 === 0 ? `SYNTH-${pad(ordinal + 1, 2)}` : null,
      };
    }),
  );
}

function createAttributions(
  base: EcommerceFixture,
  campaigns: EcommerceBusinessFixture["campaigns"],
  customersById: Map<string, EcommerceFixture["customers"][number]>,
): EcommerceBusinessFixture["attributions"] {
  const orders = base.orders.filter((order) => order.paidAt);
  type AttributionDraft = Omit<
    EcommerceBusinessFixture["attributions"][number],
    "allocatedSpend"
  >;
  const drafts: AttributionDraft[] = [];

  for (const [orderIndex, order] of orders.entries()) {
    const customer = customersById.get(order.customerId);
    if (!customer) {
      throw new Error(
        `Marketing attribution order ${order.id} references missing customer ${order.customerId}`,
      );
    }
    const day = Math.max(
      0,
      Math.min(
        fixtureDays - 1,
        Math.floor((order.placedAt.getTime() - fixtureStart.getTime()) / dayMs),
      ),
    );
    const period = Math.min(2, Math.floor(day / 20));
    const primaryChannelIndex = channels.indexOf(order.channel);
    if (primaryChannelIndex < 0) {
      throw new Error(
        `Marketing attribution order ${order.id} uses unsupported channel ${order.channel}`,
      );
    }
    const channelOffsets = [0];
    if (orderIndex % 3 === 0) channelOffsets.push(1);
    if (orderIndex % 10 === 0) channelOffsets.push(2);
    const attributedRevenueByTouchpoint = splitCents(
      Math.max(0, toCents(order.paidTotal) - toCents(order.refundedTotal)),
      channelOffsets.length,
    );

    for (const [touchpointIndex, channelOffset] of channelOffsets.entries()) {
      const channelIndex =
        (primaryChannelIndex + channelOffset) % channels.length;
      const channel = channels[channelIndex];
      const campaign = campaigns[period * channels.length + channelIndex];
      if (!channel || !campaign) {
        throw new Error(
          `Marketing attribution order ${order.id} has no campaign for period ${period} channel index ${channelIndex}`,
        );
      }

      drafts.push({
        id: `marketing_attribution_${order.id}_${pad(touchpointIndex + 1, 2)}`,
        orderId: order.id,
        campaignId: campaign.id,
        channel,
        couponCode: campaign.couponCode,
        attributedRevenue: moneyFromCents(
          attributedRevenueByTouchpoint[touchpointIndex]!,
        ),
        isNewCustomer: customer.segment === "NEW",
        touchpointAt: new Date(
          Math.max(
            campaign.startAt.getTime(),
            addHours(order.placedAt, -2 - touchpointIndex * 4).getTime(),
          ),
        ),
      });
    }
  }

  const campaignById = new Map(
    campaigns.map((campaign) => [campaign.id, campaign]),
  );
  const attributionCountByCampaign = new Map<string, number>();
  for (const draft of drafts) {
    attributionCountByCampaign.set(
      draft.campaignId,
      (attributionCountByCampaign.get(draft.campaignId) ?? 0) + 1,
    );
  }
  const seenByCampaign = new Map<string, number>();
  return drafts.map((draft) => {
    const campaign = campaignById.get(draft.campaignId);
    const attributionCount = attributionCountByCampaign.get(draft.campaignId);
    if (!campaign || !attributionCount) {
      throw new Error(
        `Marketing attribution ${draft.id} references incomplete campaign ${draft.campaignId}`,
      );
    }
    const campaignSpendCents = toCents(campaign.spend);
    const seen = seenByCampaign.get(campaign.id) ?? 0;
    seenByCampaign.set(campaign.id, seen + 1);
    const baseAllocation = Math.floor(campaignSpendCents / attributionCount);
    const allocatedSpendCents =
      baseAllocation + (seen < campaignSpendCents % attributionCount ? 1 : 0);

    return {
      ...draft,
      allocatedSpend: moneyFromCents(allocatedSpendCents),
    };
  });
}

function selectWarehouse(
  region: string,
  ordinal: number,
  warehouses: EcommerceBusinessFixture["warehouses"],
) {
  if (region === "华东") return warehouses[ordinal % 2]!;
  if (region === "华北") return warehouses[2]!;
  if (region === "华南") return warehouses[3]!;
  if (region === "华中") return warehouses[4]!;
  return warehouses[5]!;
}

function resolveShipmentStatus(
  orderStatus: EcommerceFixture["orders"][number]["status"],
  ordinal: number,
): ShipmentStatus {
  if (orderStatus === "FULFILLED") return "DELIVERED";
  if (orderStatus === "REFUNDED") {
    return ordinal % 19 === 0 ? "LOST" : "RETURNED";
  }
  if (ordinal % 53 === 0) return "LOST";
  if (ordinal % 7 === 0) return "DELAYED";
  return "IN_TRANSIT";
}

function resolveRefundReason(
  shipmentStatus: ShipmentStatus,
  ordinal: number,
): RefundReason {
  if (shipmentStatus === "LOST") return "LOST_SHIPMENT";
  return (
    [
      "CUSTOMER_REQUEST",
      "DAMAGED_ITEM",
      "DELIVERY_DELAY",
      "QUALITY_ISSUE",
      "PRICE_ADJUSTMENT",
    ] as const
  )[ordinal % 5]!;
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * dayMs);
}

function addHours(value: Date, hours: number) {
  return new Date(value.getTime() + hours * hourMs);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10).replaceAll("-", "");
}

function splitCents(totalCents: number, touchpointCount: number) {
  const weights =
    touchpointCount === 1
      ? [100]
      : touchpointCount === 2
        ? [65, 35]
        : touchpointCount === 3
          ? [55, 30, 15]
          : undefined;
  if (!weights) {
    throw new Error(
      `Unsupported marketing attribution touchpoint count ${touchpointCount}`,
    );
  }

  let allocated = 0;
  return weights.map((weight, index) => {
    const amount =
      index === weights.length - 1
        ? totalCents - allocated
        : Math.floor((totalCents * weight) / 100);
    allocated += amount;
    return amount;
  });
}

function moneyFromCents(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(absolute / 100)}.${pad(absolute % 100, 2)}`;
}

function toCents(value: string) {
  return Math.round(Number(value) * 100);
}

function pad(value: number, length: number) {
  return String(value).padStart(length, "0");
}

function toChineseOrdinal(value: number) {
  const ordinals = [
    "一号",
    "二号",
    "三号",
    "四号",
    "五号",
    "六号",
    "七号",
    "八号",
    "九号",
    "十号",
    "十一号",
    "十二号",
  ];
  return ordinals[value - 1] ?? String(value);
}

export const ecommerceBusinessFixture = createEcommerceBusinessFixture();
