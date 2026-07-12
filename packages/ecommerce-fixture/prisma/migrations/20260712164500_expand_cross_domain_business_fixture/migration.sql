-- Expand the isolated deterministic fixture with finance, inventory,
-- logistics, procurement, and marketing read models.
SET search_path TO "ecommerce_fixture";

CREATE TYPE "FinanceRefundReason" AS ENUM (
  'CUSTOMER_REQUEST',
  'DAMAGED_ITEM',
  'DELIVERY_DELAY',
  'LOST_SHIPMENT',
  'QUALITY_ISSUE',
  'PRICE_ADJUSTMENT'
);
CREATE TYPE "FinanceRefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED');
CREATE TYPE "FinanceInvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'VOID', 'MISMATCH');
CREATE TYPE "FinanceSettlementStatus" AS ENUM ('PENDING', 'SETTLED', 'DISCREPANCY');
CREATE TYPE "InventoryRiskLevel" AS ENUM ('HEALTHY', 'LOW', 'STOCKOUT', 'OVERSTOCK');
CREATE TYPE "LogisticsCarrier" AS ENUM ('SF_EXPRESS', 'JD_LOGISTICS', 'YTO_EXPRESS', 'ZTO_EXPRESS');
CREATE TYPE "LogisticsShipmentStatus" AS ENUM ('IN_TRANSIT', 'DELAYED', 'DELIVERED', 'LOST', 'RETURNED');
CREATE TYPE "LogisticsShipmentEventType" AS ENUM (
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELAYED',
  'DELIVERED',
  'LOST',
  'RETURNED'
);
CREATE TYPE "ProcurementOrderStatus" AS ENUM ('ORDERED', 'IN_TRANSIT', 'RECEIVED', 'DELAYED', 'CANCELLED');
CREATE TYPE "MarketingCampaignObjective" AS ENUM ('ACQUISITION', 'CONVERSION', 'RETENTION', 'REACTIVATION');

CREATE TABLE "FinanceRefund" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "reason" "FinanceRefundReason" NOT NULL,
  "status" "FinanceRefundStatus" NOT NULL,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "amount" DECIMAL(12,2) NOT NULL,
  "processingHours" INTEGER NOT NULL,
  CONSTRAINT "FinanceRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceRefund_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "FinanceRefund_processing_check" CHECK (
    "processingHours" >= 0
    AND ("completedAt" IS NULL OR "completedAt" >= "requestedAt")
  )
);

CREATE TABLE "FinanceInvoice" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "status" "FinanceInvoiceStatus" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "mismatchAmount" DECIMAL(12,2) NOT NULL,
  "issuedAt" TIMESTAMPTZ(3),
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinanceInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceInvoice_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "FinanceInvoice_due_check" CHECK ("issuedAt" IS NULL OR "dueAt" >= "issuedAt")
);

CREATE TABLE "FinanceSettlement" (
  "id" TEXT NOT NULL,
  "settlementNumber" TEXT NOT NULL,
  "channel" "EcommerceSalesChannel" NOT NULL,
  "periodStart" TIMESTAMPTZ(3) NOT NULL,
  "periodEnd" TIMESTAMPTZ(3) NOT NULL,
  "grossAmount" DECIMAL(14,2) NOT NULL,
  "refundAmount" DECIMAL(14,2) NOT NULL,
  "feeAmount" DECIMAL(14,2) NOT NULL,
  "expectedAmount" DECIMAL(14,2) NOT NULL,
  "settledAmount" DECIMAL(14,2),
  "differenceAmount" DECIMAL(14,2),
  "status" "FinanceSettlementStatus" NOT NULL,
  "settledAt" TIMESTAMPTZ(3),
  CONSTRAINT "FinanceSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceSettlement_period_check" CHECK ("periodEnd" > "periodStart"),
  CONSTRAINT "FinanceSettlement_amounts_check" CHECK (
    "grossAmount" >= 0
    AND "refundAmount" >= 0
    AND "feeAmount" >= 0
    AND (
      (
        "status" = 'PENDING'
        AND "settledAmount" IS NULL
        AND "differenceAmount" IS NULL
        AND "settledAt" IS NULL
      )
      OR (
        "status" <> 'PENDING'
        AND "settledAmount" IS NOT NULL
        AND "differenceAmount" = "settledAmount" - "expectedAmount"
        AND "settledAt" IS NOT NULL
      )
    )
  )
);

CREATE TABLE "InventoryWarehouse" (
  "id" TEXT NOT NULL,
  "warehouseCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "capacityUnits" INTEGER NOT NULL,
  CONSTRAINT "InventoryWarehouse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryWarehouse_capacity_check" CHECK ("capacityUnits" > 0)
);

CREATE TABLE "InventorySnapshot" (
  "id" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "snapshotDate" TIMESTAMPTZ(3) NOT NULL,
  "onHand" INTEGER NOT NULL,
  "reserved" INTEGER NOT NULL,
  "inTransit" INTEGER NOT NULL,
  "safetyStock" INTEGER NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "riskLevel" "InventoryRiskLevel" NOT NULL,
  CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventorySnapshot_quantities_check" CHECK (
    "onHand" >= 0
    AND "reserved" >= 0
    AND "reserved" <= "onHand"
    AND "inTransit" >= 0
    AND "safetyStock" >= 0
    AND "unitCost" >= 0
  )
);

CREATE TABLE "LogisticsShipment" (
  "id" TEXT NOT NULL,
  "shipmentNumber" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "carrier" "LogisticsCarrier" NOT NULL,
  "status" "LogisticsShipmentStatus" NOT NULL,
  "shippedAt" TIMESTAMPTZ(3) NOT NULL,
  "promisedAt" TIMESTAMPTZ(3) NOT NULL,
  "deliveredAt" TIMESTAMPTZ(3),
  "freightCost" DECIMAL(12,2) NOT NULL,
  "distanceKm" INTEGER NOT NULL,
  CONSTRAINT "LogisticsShipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticsShipment_timeline_check" CHECK (
    "promisedAt" > "shippedAt"
    AND ("deliveredAt" IS NULL OR "deliveredAt" >= "shippedAt")
  ),
  CONSTRAINT "LogisticsShipment_cost_check" CHECK ("freightCost" >= 0 AND "distanceKm" >= 0)
);

CREATE TABLE "LogisticsShipmentEvent" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "type" "LogisticsShipmentEventType" NOT NULL,
  "eventAt" TIMESTAMPTZ(3) NOT NULL,
  "location" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  CONSTRAINT "LogisticsShipmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcurementSupplier" (
  "id" TEXT NOT NULL,
  "supplierCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "rating" DECIMAL(3,2) NOT NULL,
  "leadTimeDays" INTEGER NOT NULL,
  "onTimeRate" DECIMAL(5,4) NOT NULL,
  CONSTRAINT "ProcurementSupplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcurementSupplier_quality_check" CHECK (
    "rating" >= 0 AND "rating" <= 5
    AND "leadTimeDays" > 0
    AND "onTimeRate" >= 0 AND "onTimeRate" <= 1
  )
);

CREATE TABLE "ProcurementOrder" (
  "id" TEXT NOT NULL,
  "purchaseOrderNumber" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "status" "ProcurementOrderStatus" NOT NULL,
  "orderedAt" TIMESTAMPTZ(3) NOT NULL,
  "expectedAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3),
  "amount" DECIMAL(14,2) NOT NULL,
  "skuCount" INTEGER NOT NULL,
  "delayedDays" INTEGER NOT NULL,
  CONSTRAINT "ProcurementOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcurementOrder_timeline_check" CHECK (
    "expectedAt" > "orderedAt"
    AND ("receivedAt" IS NULL OR "receivedAt" >= "orderedAt")
  ),
  CONSTRAINT "ProcurementOrder_values_check" CHECK (
    "amount" >= 0 AND "skuCount" > 0 AND "delayedDays" >= 0
  )
);

CREATE TABLE "MarketingCampaign" (
  "id" TEXT NOT NULL,
  "campaignCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "EcommerceSalesChannel" NOT NULL,
  "objective" "MarketingCampaignObjective" NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "budget" DECIMAL(14,2) NOT NULL,
  "spend" DECIMAL(14,2) NOT NULL,
  "couponCode" TEXT,
  CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingCampaign_period_check" CHECK ("endAt" > "startAt"),
  CONSTRAINT "MarketingCampaign_budget_check" CHECK (
    "budget" >= 0 AND "spend" >= 0 AND "spend" <= "budget"
  )
);

CREATE TABLE "MarketingAttribution" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "campaignId" TEXT,
  "channel" "EcommerceSalesChannel" NOT NULL,
  "couponCode" TEXT,
  "attributedRevenue" DECIMAL(14,2) NOT NULL,
  "allocatedSpend" DECIMAL(14,2) NOT NULL,
  "isNewCustomer" BOOLEAN NOT NULL,
  "touchpointAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MarketingAttribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingAttribution_amounts_check" CHECK (
    "attributedRevenue" >= 0 AND "allocatedSpend" >= 0
  )
);

CREATE UNIQUE INDEX "FinanceRefund_orderId_key" ON "FinanceRefund"("orderId");
CREATE INDEX "FinanceRefund_status_requestedAt_idx" ON "FinanceRefund"("status", "requestedAt");
CREATE UNIQUE INDEX "FinanceInvoice_orderId_key" ON "FinanceInvoice"("orderId");
CREATE UNIQUE INDEX "FinanceInvoice_invoiceNumber_key" ON "FinanceInvoice"("invoiceNumber");
CREATE INDEX "FinanceInvoice_status_dueAt_idx" ON "FinanceInvoice"("status", "dueAt");
CREATE UNIQUE INDEX "FinanceSettlement_settlementNumber_key" ON "FinanceSettlement"("settlementNumber");
CREATE INDEX "FinanceSettlement_channel_periodStart_idx" ON "FinanceSettlement"("channel", "periodStart");
CREATE INDEX "FinanceSettlement_status_periodEnd_idx" ON "FinanceSettlement"("status", "periodEnd");
CREATE UNIQUE INDEX "InventoryWarehouse_warehouseCode_key" ON "InventoryWarehouse"("warehouseCode");
CREATE INDEX "InventoryWarehouse_region_idx" ON "InventoryWarehouse"("region");
CREATE UNIQUE INDEX "InventorySnapshot_warehouseId_productId_snapshotDate_key"
  ON "InventorySnapshot"("warehouseId", "productId", "snapshotDate");
CREATE INDEX "InventorySnapshot_snapshotDate_riskLevel_idx" ON "InventorySnapshot"("snapshotDate", "riskLevel");
CREATE INDEX "InventorySnapshot_productId_snapshotDate_idx" ON "InventorySnapshot"("productId", "snapshotDate");
CREATE UNIQUE INDEX "LogisticsShipment_shipmentNumber_key" ON "LogisticsShipment"("shipmentNumber");
CREATE UNIQUE INDEX "LogisticsShipment_orderId_key" ON "LogisticsShipment"("orderId");
CREATE INDEX "LogisticsShipment_status_promisedAt_idx" ON "LogisticsShipment"("status", "promisedAt");
CREATE INDEX "LogisticsShipment_warehouseId_shippedAt_idx" ON "LogisticsShipment"("warehouseId", "shippedAt");
CREATE INDEX "LogisticsShipmentEvent_shipmentId_eventAt_idx" ON "LogisticsShipmentEvent"("shipmentId", "eventAt");
CREATE INDEX "LogisticsShipmentEvent_type_eventAt_idx" ON "LogisticsShipmentEvent"("type", "eventAt");
CREATE UNIQUE INDEX "ProcurementSupplier_supplierCode_key" ON "ProcurementSupplier"("supplierCode");
CREATE INDEX "ProcurementSupplier_category_region_idx" ON "ProcurementSupplier"("category", "region");
CREATE UNIQUE INDEX "ProcurementOrder_purchaseOrderNumber_key" ON "ProcurementOrder"("purchaseOrderNumber");
CREATE INDEX "ProcurementOrder_status_expectedAt_idx" ON "ProcurementOrder"("status", "expectedAt");
CREATE INDEX "ProcurementOrder_supplierId_orderedAt_idx" ON "ProcurementOrder"("supplierId", "orderedAt");
CREATE INDEX "ProcurementOrder_warehouseId_expectedAt_idx" ON "ProcurementOrder"("warehouseId", "expectedAt");
CREATE UNIQUE INDEX "MarketingCampaign_campaignCode_key" ON "MarketingCampaign"("campaignCode");
CREATE INDEX "MarketingCampaign_channel_startAt_endAt_idx" ON "MarketingCampaign"("channel", "startAt", "endAt");
CREATE INDEX "MarketingAttribution_campaignId_touchpointAt_idx" ON "MarketingAttribution"("campaignId", "touchpointAt");
CREATE INDEX "MarketingAttribution_channel_touchpointAt_idx" ON "MarketingAttribution"("channel", "touchpointAt");
CREATE INDEX "MarketingAttribution_orderId_touchpointAt_idx" ON "MarketingAttribution"("orderId", "touchpointAt");

ALTER TABLE "FinanceRefund"
  ADD CONSTRAINT "FinanceRefund_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "EcommerceOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceInvoice"
  ADD CONSTRAINT "FinanceInvoice_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "EcommerceOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventorySnapshot"
  ADD CONSTRAINT "InventorySnapshot_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventorySnapshot"
  ADD CONSTRAINT "InventorySnapshot_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "EcommerceProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticsShipment"
  ADD CONSTRAINT "LogisticsShipment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "EcommerceOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticsShipment"
  ADD CONSTRAINT "LogisticsShipment_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogisticsShipmentEvent"
  ADD CONSTRAINT "LogisticsShipmentEvent_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "LogisticsShipment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrder"
  ADD CONSTRAINT "ProcurementOrder_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "ProcurementSupplier"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrder"
  ADD CONSTRAINT "ProcurementOrder_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingAttribution"
  ADD CONSTRAINT "MarketingAttribution_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "EcommerceOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAttribution"
  ADD CONSTRAINT "MarketingAttribution_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
